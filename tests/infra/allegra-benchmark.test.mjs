import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { collectBaseline, defaultOutputPath, resolveOutputPath } from '../../scripts/bench/allegra-baseline.mjs';

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

test('benchmark names output by the full commit and rejects paths outside the repository', () => {
  assert.equal(defaultOutputPath('9'.repeat(40)), `.planning/v2/design-guards-${'9'.repeat(40)}.json`);
  assert.throws(() => defaultOutputPath('short'), /full 40-character SHA/);
  assert.equal(resolveOutputPath(root, '.planning/v2/report.json'), path.join(root, '.planning/v2/report.json'));
  assert.throws(() => resolveOutputPath(root, '../outside.json'), /inside the repository/);
  assert.throws(() => resolveOutputPath(root, path.join(root, 'outside.json')), /repository-relative/);
});
