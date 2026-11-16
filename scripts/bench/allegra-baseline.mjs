#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '../..');
const GUARD_PATH = 'apps/mobile/src/designGuards.test.ts';
const BASELINE_PATH = 'apps/mobile/src/designGuards.baseline.json';

// Counts are produced by the existing guard implementation. These descriptions make the report
// interpretable while the source SHA pins the exact regex/AST implementation used for the run.
const RULES = {
  pressable: { method: 'regex', unit: 'matches per file', definition: 'Bare Pressable and Touchable JSX tags.' },
  slideModal: { method: 'regex', unit: 'matches per file', definition: 'React Native modal animationType="slide" uses.' },
  weight: { method: 'regex', unit: 'matches per file', definition: 'Disallowed fontWeight values.' },
  tracking: { method: 'regex', unit: 'matches per file', definition: 'Raw letterSpacing declarations.' },
  bottomPad: { method: 'regex', unit: 'matches per file', definition: 'Large screen paddingBottom values.' },
  alert: { method: 'regex', unit: 'matches per file', definition: 'Alert.alert calls with buttons.' },
  color: { method: 'regex', unit: 'matches per file', definition: 'Raw color literals in screens.' },
  typeSize: { method: 'regex', unit: 'matches per file', definition: 'Raw fontSize literals in screens.' },
  componentColor: { method: 'regex', unit: 'matches per file', definition: 'Raw color strings in non-screen components.' },
  componentTypeSize: { method: 'regex', unit: 'matches per file', definition: 'Raw fontSize literals in non-screen components.' },
  motionLiteral: { method: 'TypeScript AST heuristic', unit: 'violations per file', definition: 'Numeric settings in recognized animation calls.' },
  reduceMotion: { method: 'TypeScript AST heuristic', unit: 'files with a violation', definition: 'Motion files without reduced-motion reference or documented exception; at most one per file.' },
  layoutAnim: { method: 'TypeScript AST heuristic', unit: 'violations per file', definition: 'Layout properties driven by animated values.' }
};

const sha256 = value => createHash('sha256').update(value).digest('hex');

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args[0]} failed`);
  // Porcelain v1 uses its first column to distinguish staged and unstaged changes.
  // Remove only Git's final newline; trim() would erase a leading status column.
  return result.stdout.replace(/\r?\n$/, '');
}

export function parseStatusPorcelain(status) {
  return status ? status.split(/\r?\n/) : [];
}

export function readGitStatusPorcelain(root) {
  return parseStatusPorcelain(git(root, ['status', '--porcelain=v1', '--untracked-files=all']));
}

function resolveCompiler(root) {
  const rootRequire = createRequire(path.join(root, 'package.json'));
  const compilerPath = fs.realpathSync(rootRequire.resolve('typescript'));
  const compiler = rootRequire('typescript');
  const packagePath = path.resolve(path.dirname(compilerPath), '..', 'package.json');
  const compilerPackage = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const declaredVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    .devDependencies?.typescript;
  if (!/^\d+\.\d+\.\d+$/.test(declaredVersion ?? '') || declaredVersion !== compilerPackage.version || compiler.version !== compilerPackage.version) {
    throw new Error(`root TypeScript compiler does not match the exact package pin (${declaredVersion ?? 'missing'})`);
  }
  return {
    compiler,
    provenance: {
      package: 'typescript',
      version: compiler.version,
      packageVersion: compilerPackage.version,
      resolvedPath: path.relative(root, compilerPath).split(path.sep).join('/')
    }
  };
}

function loadDesignGuardCounts(root) {
  const sourcePath = path.join(root, GUARD_PATH);
  const source = fs.readFileSync(sourcePath, 'utf8');
  const { compiler: ts, provenance } = resolveCompiler(root);
  // Expose private measurement helpers only in memory. The checked-in guard remains byte-for-byte
  // unchanged, while its actual counting and inventory implementations are executed directly.
  const instrumentedSource = `${source}\nmodule.exports.countAll = countAll;\nmodule.exports.listSourceFiles = () => sourceFiles(SRC).map(rel).sort();\n`;
  const compiled = ts.transpileModule(instrumentedSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  // The guard only needs these read APIs to enumerate and inspect mobile sources. An allowlist
  // makes filesystem writes unavailable to the evaluated module, including baseline updates.
  const readOnlyFs = Object.freeze({
    readdirSync: fs.readdirSync.bind(fs),
    readFileSync: fs.readFileSync.bind(fs)
  });
  const safeRequire = specifier => {
    if (specifier === 'fs') return readOnlyFs;
    if (specifier === 'path') return path;
    if (specifier === 'typescript') return ts;
    throw new Error(`unexpected design guard import: ${specifier}`);
  };
  const sandbox = {
    __dirname: path.dirname(sourcePath), __filename: sourcePath,
    exports: module.exports, module, require: safeRequire,
    process: { env: Object.freeze({}) },
    describe: () => {}, beforeAll: () => {}, afterAll: () => {}, it: () => {}, test: () => {},
    expect: () => { throw new Error('design guard test callback must not run in benchmark'); }
  };
  vm.runInNewContext(compiled, sandbox, { filename: GUARD_PATH });
  if (typeof module.exports.countAll !== 'function') throw new Error('design guard countAll export was not found');
  if (typeof module.exports.listSourceFiles !== 'function') throw new Error('design guard source inventory export was not found');
  return { counts: module.exports.countAll(), sourceFiles: module.exports.listSourceFiles(), compiler: provenance };
}

export function hashSourceInputs(root, sourceFiles) {
  return sourceFiles.map(file => ({ path: file, sha256: sha256(fs.readFileSync(path.join(root, 'apps/mobile/src', file))) }));
}

function compareRules(counts, baseline) {
  const unknown = [...new Set([...Object.keys(counts), ...Object.keys(baseline)])]
    .filter(name => !Object.hasOwn(RULES, name));
  if (unknown.length) throw new Error(`design guard rules need benchmark definitions: ${unknown.join(', ')}`);
  return Object.fromEntries(Object.keys(RULES).map(name => {
    const current = Object.fromEntries(Object.entries(counts[name] ?? {}).sort(([a], [b]) => a.localeCompare(b)));
    const allowed = Object.fromEntries(Object.entries(baseline[name] ?? {}).sort(([a], [b]) => a.localeCompare(b)));
    const sum = values => Object.values(values).reduce((total, count) => total + count, 0);
    return [name, {
      ...RULES[name],
      total: sum(current),
      fileCount: Object.keys(current).length,
      countsByFile: current,
      baselineTotal: sum(allowed),
      baselineFileCount: Object.keys(allowed).length,
      baselineByFile: allowed,
      filesOverBaseline: Object.keys(current).filter(file => current[file] > (allowed[file] ?? 0)),
      filesBelowBaseline: Object.keys(allowed).filter(file => (current[file] ?? 0) < allowed[file])
    }];
  }));
}

export function defaultOutputPath(commit) {
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new TypeError('commit must be a full 40-character SHA');
  return `.planning/v2/design-guards-${commit}.json`;
}

export function resolveOutputPath(root, outputFile) {
  if (typeof outputFile !== 'string' || outputFile.length === 0 || path.isAbsolute(outputFile)) {
    throw new Error('--output must be a repository-relative path');
  }
  const absoluteRoot = path.resolve(root);
  const realRoot = fs.realpathSync(absoluteRoot);
  const destination = path.resolve(absoluteRoot, outputFile);
  const relative = path.relative(absoluteRoot, destination);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('--output must resolve to a file inside the repository');
  }
  let existingParent = path.dirname(destination);
  const missingSegments = [];
  while (!fs.existsSync(existingParent)) {
    missingSegments.unshift(path.basename(existingParent));
    const parent = path.dirname(existingParent);
    if (parent === existingParent) throw new Error('--output parent cannot be resolved');
    existingParent = parent;
  }
  const resolvedParent = path.resolve(fs.realpathSync(existingParent), ...missingSegments);
  const resolvedRelative = path.relative(realRoot, resolvedParent);
  if (resolvedRelative === '..' || resolvedRelative.startsWith(`..${path.sep}`) || path.isAbsolute(resolvedRelative)) {
    throw new Error('--output parent must resolve to a directory inside the repository');
  }
  return destination;
}

export function collectBaseline({ root = ROOT, outputFile, now = () => new Date() } = {}) {
  const absoluteRoot = path.resolve(root);
  const commit = git(absoluteRoot, ['rev-parse', 'HEAD']);
  const statusPorcelain = readGitStatusPorcelain(absoluteRoot);
  const guardSource = fs.readFileSync(path.join(absoluteRoot, GUARD_PATH));
  const baselineSource = fs.readFileSync(path.join(absoluteRoot, BASELINE_PATH));
  const scriptSource = fs.readFileSync(SCRIPT_PATH);
  const { counts, sourceFiles, compiler } = loadDesignGuardCounts(absoluteRoot);
  const baseline = JSON.parse(baselineSource.toString('utf8'));
  const report = {
    schemaVersion: 1,
    capturedAt: now().toISOString(),
    repository: {
      commit,
      branch: git(absoluteRoot, ['branch', '--show-current']),
      dirty: statusPorcelain.length > 0,
      statusPorcelain
    },
    tool: { path: 'scripts/bench/allegra-baseline.mjs', sha256: sha256(scriptSource) },
    designGuard: {
      evidenceClass: 'current-source-repro',
      path: GUARD_PATH,
      sha256: sha256(guardSource),
      compiler,
      sourceInputs: hashSourceInputs(absoluteRoot, sourceFiles),
      baselinePath: BASELINE_PATH,
      baselineSha256: sha256(baselineSource),
      baselineComparison: 'per-file counts; a missing baseline entry is treated as zero',
      rules: compareRules(counts, baseline),
      limitations: [
        'Counts are static source/design-guard measurements, not runtime performance or proof of visual quality, accessibility, or behavior.',
        'Regex rules may match comments and strings; AST rules are source heuristics implemented by the hashed guard file.',
        'The report records status paths, not staged/unstaged file contents; guard, baseline, and scanned source hashes identify the measured inputs.'
      ]
    },
    notMeasured: [
      'Runtime or device performance',
      'Published or local APK size',
      'Visual quality, accessibility behavior, playback, or emulator/device results'
    ]
  };
  return { report, outputFile: outputFile ?? defaultOutputPath(commit) };
}

function help() {
  return [
    'Usage: node scripts/bench/allegra-baseline.mjs [--output <repo-relative-path>]',
    '',
    'Recounts the existing mobile design guards and compares them per file with the committed designGuards.baseline.json.',
    'The report pins the commit, dirty status, tool/source/baseline SHA-256 hashes, and rule totals and per-file counts.',
    'Default output: .planning/v2/design-guards-<HEAD-SHA>.json (created exclusively; existing files are never overwritten).',
    'This is static source evidence only. It does not measure runtime performance, APK size, accessibility behavior, or device playback.'
  ].join('\n');
}

function parseArgs(args) {
  let outputFile;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--output') {
      outputFile = args[index + 1];
      if (!outputFile) throw new Error('--output requires a path');
      index += 1;
    } else throw new Error(`unknown option: ${arg}`);
  }
  return { outputFile };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) process.stdout.write(`${help()}\n`);
    else {
      const { report, outputFile } = collectBaseline(options);
      const destination = resolveOutputPath(ROOT, outputFile);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
      process.stdout.write(`Wrote ${outputFile}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
