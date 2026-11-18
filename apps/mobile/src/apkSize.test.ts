import * as fs from 'fs';
import * as path from 'path';

/**
 * APK size guard. llama.rn (the on-device AI engine behind the archived Your DJ) put seven CPU builds of the
 * engine plus GPU files in every APK, about 30 MB of a 62 MB download, while nothing the app runs imported it.
 * It was removed in 1.70.2. If the DJ comes back, restore it on purpose (archive/dj/README.md) and update this test.
 */
const read = (file: string): string => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

describe('APK size', () => {
  it('does not ship the on-device AI engine', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies?: Record<string, string> };
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain('llama.rn');
    expect(read('app.json')).not.toContain('llama.rn');
  });

  it('never imports llama.rn from the app, which has no archive/ code in it', () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name) && entry.name !== 'apkSize.test.ts') files.push(full);
      }
    };
    walk(__dirname);
    const importing = files.filter(file => /from ['"]llama\.rn['"]|import\(['"]llama\.rn['"]\)|require\(['"]llama\.rn['"]\)/.test(fs.readFileSync(file, 'utf8')));
    expect(importing).toEqual([]);
  });
});
