import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

describe('Spotify disconnect confirmation', () => {
  it('keeps the account connected until the destructive sheet is confirmed', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/components/import/SpotifySyncPanel.tsx'), 'utf8');
    const disconnect = source.match(/const\s+disconnect\s*=\s*\(\):\s*void\s*=>\s*\{([\s\S]*?)\n\s*\};/)?.[1] ?? '';
    const confirm = source.match(/const\s+confirmSpotifyDisconnect\s*=\s*\(\):\s*void\s*=>\s*\{([\s\S]*?)\n\s*\};/)?.[1] ?? '';

    expect(source).not.toContain('Alert.alert');
    expect(disconnect).toContain('setConfirmDisconnect(true)');
    expect(disconnect).not.toContain('disconnectSpotify(');
    expect(confirm).toContain('disconnectSpotify(token)');
    expect(source).toMatch(/<ConfirmSheet[\s\S]*?visible=\{confirmDisconnect\}[\s\S]*?destructive[\s\S]*?onConfirm=\{confirmSpotifyDisconnect\}/);
  });
});

// Owner report: the Transfer button sat below every Spotify playlist, so a long list had to be scrolled past to use it.
describe('Spotify transfer action', () => {
  it('comes before the list of Spotify playlists, so it is reachable at any playlist count', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/components/import/SpotifySyncPanel.tsx'), 'utf8');
    const action = source.indexOf('onPress={() => void transfer()}');
    const list = source.indexOf('<View style={styles.list}>');
    expect(action).toBeGreaterThan(-1);
    expect(list).toBeGreaterThan(-1);
    expect(action).toBeLessThan(list);
    expect(source.match(/onPress=\{\(\) => void transfer\(\)\}/g)).toHaveLength(1);
  });
});
