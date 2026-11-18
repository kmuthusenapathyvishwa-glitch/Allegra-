import * as fs from 'fs';
import * as path from 'path';
import { filterPlaylists, PLAYLIST_QUICK_ACTIONS, playlistsBody } from './playlistsView';

const playlists = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Playlist ${i}` }));

describe('Playlists page: what it shows for any number of playlists', () => {
  it('shows placeholders only while the first playlists load, the empty state with none, the grid otherwise', () => {
    expect(playlistsBody(true, 0)).toBe('placeholder');
    expect(playlistsBody(false, 0)).toBe('empty');
    expect(playlistsBody(false, 3)).toBe('grid');
    expect(playlistsBody(true, 3)).toBe('grid');
    expect(playlistsBody(false, 54)).toBe('grid');
  });

  it('offers a new playlist and Spotify import, in that order, in plain sentence case', () => {
    expect(PLAYLIST_QUICK_ACTIONS.map(action => action.id)).toEqual(['create', 'import']);
    expect(PLAYLIST_QUICK_ACTIONS.map(action => action.label)).toEqual(['New playlist', 'Import from Spotify']);
  });

  it('filters by name without touching the actions, with zero, a few or fifty-plus playlists', () => {
    for (const count of [0, 3, 54]) {
      const all = playlists(count);
      expect(filterPlaylists(all, '')).toHaveLength(count);
      expect(filterPlaylists(all, '  ')).toHaveLength(count);
      expect(filterPlaylists(all, 'PLAYLIST 2').map(row => row.id)).toEqual(all.filter(row => row.name.includes('Playlist 2')).map(row => row.id));
      expect(filterPlaylists(all, 'zzz')).toEqual([]);
    }
  });
});

// Owner report: "Import Spotify Playlist" sat at the bottom, behind however many playlists there were. The actions are
// a fixed row above the list in the page's own markup, so their place does not depend on the count.
describe('Playlists page: the quick actions come first', () => {
  const source = fs.readFileSync(path.join(__dirname, 'PlaylistsScreen.tsx'), 'utf8');

  it('draws the action row above the loading, empty and grid states, outside the list', () => {
    const row = source.indexOf('<ChipRow');
    expect(row).toBeGreaterThan(-1);
    expect(row).toBeLessThan(source.indexOf("body === 'placeholder'"));
    expect(row).toBeLessThan(source.indexOf("body === 'empty'"));
    expect(row).toBeLessThan(source.indexOf('<FlatList'));
  });

  it('never puts content that can change size in the list header', () => {
    expect(source).not.toMatch(/ListHeaderComponent/);
    expect(source).not.toMatch(/ListFooterComponent/);
  });

  it('opens the Spotify import and the playlist editor', () => {
    expect(source).toMatch(/navigation\.navigate\('Import'\)/);
    expect(source).toMatch(/navigation\.navigate\('CreatePlaylist'\)/);
    expect(source).toMatch(/PLAYLIST_QUICK_ACTIONS\.map/);
  });
});
