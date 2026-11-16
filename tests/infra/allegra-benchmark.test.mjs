import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { collectBaseline, defaultOutputPath, hashSourceInputs, parseStatusPorcelain, readGitStatusPorcelain, resolveOutputPath } from '../../scripts/bench/allegra-baseline.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baselinePath = path.join(root, 'apps/mobile/src/designGuards.baseline.json');

test('benchmark reports source-backed guard counts without modifying its inputs', () => {
  const baselineBefore = readFileSync(baselinePath);
  const guardBefore = readFileSync(path.join(root, 'apps/mobile/src/designGuards.test.ts'));
  const { report, outputFile } = collectBaseline({
    root,
    now: () => new Date('2026-11-16T00:00:00.000Z')
  });

  assert.deepEqual(readFileSync(baselinePath), baselineBefore);
  assert.deepEqual(readFileSync(path.join(root, 'apps/mobile/src/designGuards.test.ts')), guardBefore);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.capturedAt, '2026-11-16T00:00:00.000Z');
  assert.match(report.repository.commit, /^[0-9a-f]{40}$/);
  assert.equal(typeof report.repository.branch, 'string');
  assert.equal(report.repository.dirty, report.repository.statusPorcelain.length > 0);
  assert.equal(outputFile, defaultOutputPath(report.repository.commit));
  assert.match(report.tool.sha256, /^[0-9a-f]{64}$/);
  assert.match(report.designGuard.sha256, /^[0-9a-f]{64}$/);
  assert.match(report.designGuard.baselineSha256, /^[0-9a-f]{64}$/);
  assert.equal(report.designGuard.compiler.package, 'typescript');
  assert.equal(report.designGuard.compiler.version, '5.9.3');
  assert.equal(report.designGuard.compiler.packageVersion, report.designGuard.compiler.version);
  assert.equal(report.designGuard.compiler.resolvedPath, 'node_modules/typescript/lib/typescript.js');
  assert.ok(report.designGuard.sourceInputs.length > 0);
  assert.deepEqual(report.designGuard.sourceInputs.map(input => input.path), [...report.designGuard.sourceInputs.map(input => input.path)].sort());
  assert.ok(report.designGuard.sourceInputs.some(input => input.path.endsWith('.tsx')));
  assert.ok(report.designGuard.sourceInputs.every(input => /^[0-9a-f]{64}$/.test(input.sha256)));
  const countedFiles = new Set(Object.values(report.designGuard.rules).flatMap(rule => Object.keys(rule.countsByFile)));
  assert.ok(report.designGuard.sourceInputs.some(input => !countedFiles.has(input.path)), 'hashes source files with zero counts');
  assert.equal(report.designGuard.evidenceClass, 'current-source-repro');

  const expectedRules = [
    'pressable', 'slideModal', 'weight', 'tracking', 'bottomPad', 'alert', 'color', 'typeSize',
    'componentColor', 'componentTypeSize', 'motionLiteral', 'reduceMotion', 'layoutAnim'
  ];
  assert.deepEqual(Object.keys(report.designGuard.rules), expectedRules);
  for (const rule of Object.values(report.designGuard.rules)) {
    assert.equal(Number.isInteger(rule.total), true);
    assert.equal(Number.isInteger(rule.fileCount), true);
    assert.equal(rule.fileCount, Object.keys(rule.countsByFile).length);
    assert.equal(typeof rule.definition, 'string');
    assert.equal(rule.method === 'regex' || rule.method === 'TypeScript AST heuristic', true);
    assert.equal(rule.total, Object.values(rule.countsByFile).reduce((sum, count) => sum + count, 0));
    for (const file of Object.keys(rule.countsByFile)) {
      assert.equal(file.startsWith('/') || file.includes('\\'), false);
      assert.equal(file.split('/').includes('..'), false);
    }
  }
  assert.deepEqual(report.notMeasured.includes('Runtime or device performance'), true);
  assert.doesNotMatch(JSON.stringify(report), /[A-Za-z]:[\\/](?:Users|dev)[\\/]/);
});

test('porcelain status parsing preserves Git status columns and splits only records', () => {
  assert.deepEqual(parseStatusPorcelain(' M apps/mobile/src/Changed.tsx\n?? new-file.ts'), [
    ' M apps/mobile/src/Changed.tsx',
    '?? new-file.ts'
  ]);
  assert.deepEqual(parseStatusPorcelain(''), []);
});

test('Git status collection preserves the unstaged-change column from porcelain output', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'allegra-benchmark-git-'));
  try {
    execFileSync('git', ['init', '--quiet', temp]);
    writeFileSync(path.join(temp, 'tracked.txt'), 'before\n');
    execFileSync('git', ['-C', temp, 'add', 'tracked.txt']);
    execFileSync('git', ['-C', temp, '-c', 'user.name=Benchmark Test', '-c', 'user.email=benchmark@example.invalid', 'commit', '--quiet', '-m', 'base']);
    writeFileSync(path.join(temp, 'tracked.txt'), 'after\n');
    assert.deepEqual(readGitStatusPorcelain(temp), [' M tracked.txt']);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('benchmark names output by the full commit and rejects paths outside the repository', () => {
  assert.equal(defaultOutputPath('9'.repeat(40)), `.planning/v2/design-guards-${'9'.repeat(40)}.json`);
  assert.throws(() => defaultOutputPath('short'), /full 40-character SHA/);
  assert.equal(resolveOutputPath(root, '.planning/v2/report.json'), path.join(root, '.planning/v2/report.json'));
  assert.throws(() => resolveOutputPath(root, '../outside.json'), /inside the repository/);
  assert.throws(() => resolveOutputPath(root, path.join(root, 'outside.json')), /repository-relative/);
});

test('source input hashes change when scanned file contents change', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'allegra-benchmark-hash-'));
  const sourceDir = path.join(temp, 'apps/mobile/src/components');
  mkdirSync(sourceDir, { recursive: true });
  const sourcePath = path.join(sourceDir, 'ZeroCount.tsx');
  try {
    writeFileSync(sourcePath, 'export const value = 1;\n');
    const before = hashSourceInputs(temp, ['components/ZeroCount.tsx']);
    writeFileSync(sourcePath, 'export const value = 2;\n');
    const after = hashSourceInputs(temp, ['components/ZeroCount.tsx']);
    assert.equal(before[0].path, 'components/ZeroCount.tsx');
    assert.notEqual(before[0].sha256, after[0].sha256);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('output path rejects a repository directory symlink that resolves outside', t => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'allegra-benchmark-path-'));
  const repository = path.join(temp, 'repo');
  const outside = path.join(temp, 'outside');
  mkdirSync(repository);
  mkdirSync(outside);
  try {
    try {
      symlinkSync(outside, path.join(repository, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP', 'EINVAL'].includes(error.code)) {
        t.skip(`directory symlinks are unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    assert.throws(() => resolveOutputPath(repository, 'escape/report.json'), /resolve to a directory inside/);
    assert.equal(resolveOutputPath(repository, 'reports/report.json'), path.join(repository, 'reports', 'report.json'));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
