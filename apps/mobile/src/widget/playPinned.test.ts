/**
 * A pinned playlist tapped on the widget must play whatever its page lists, not only downloaded songs (1.70.0).
 * Owner report: the tile said "12 songs" and nothing played, because the playlist was built on the website and holds
 * streaming entries only, which the old tap threw away and then told nobody about.
 */
const mockLocal = jest.fn();
const mockOrder = jest.fn();
const mockOnline = jest.fn();
const mockLikes = jest.fn();
const mockSetPlaylistQueue = jest.fn();
const mockPlayerState = { currentSongId: null as string | null };
let mockAlive = false;
const mockSetQueue = jest.fn();
let mockAvailable = true;

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('../database/playlistQueries', () => ({
  getPlaylistSongs: (...args: unknown[]) => mockLocal(...args),
  getPlaylistItemOrder: (...args: unknown[]) => mockOrder(...args),
}));
jest.mock('../database/syncQueries', () => ({
  getOnlinePlaylistSongs: (...args: unknown[]) => mockOnline(...args),
  getOnlineLikes: (...args: unknown[]) => mockLikes(...args),
}));
// The real helpers read the catalog and the player; these keep their contract: an online row becomes a stream song,
// and a ref that names no catalog song cannot be played.
jest.mock('../services/sync/onlineSongs', () => ({
  onlineRowToSong: (row: { ref: string; title: string; artist?: string }) => ({
    id: `stream:${row.ref}`, title: row.title, artist: row.artist, gradientId: 'dynamic', duration: 1, dateCreated: '', dateModified: '', playCount: 0, lyrics: [],
  }),
  instantStreamSong: (song: { id: string }) => (song.id.includes('bad') ? null : { ...song, audioUri: `https://api.example/stream/${song.id}` }),
}));
jest.mock('../store/playerStore', () => ({
  usePlayerStore: { getState: () => ({ setPlaylistQueue: mockSetPlaylistQueue, currentSongId: mockPlayerState.currentSongId }) },
  usesNativeQueue: () => mockAlive,
}));
jest.mock('../playback/nativeQueue', () => ({
  nativeQueue: { available: () => mockAvailable, setQueue: (...args: unknown[]) => mockSetQueue(...args) },
}));

import { pinnedNotice, playPinnedPlaylist } from './playPinned';
import type { Song } from '../types/song';

const song = (id: string, audioUri?: string, extra: Partial<Song> = {}): Song => ({
  id, title: id, artist: 'Artist', gradientId: '1', duration: 1, dateCreated: '', dateModified: '', playCount: 0, lyrics: [], audioUri, ...extra,
});
const row = (ref: string, title = ref) => ({ ref, title, artist: 'Artist', duration: 1, at: 1 });

beforeEach(() => {
  jest.clearAllMocks();
  mockSetPlaylistQueue.mockReset();
  mockLocal.mockResolvedValue([]);
  mockOrder.mockResolvedValue([]);
  mockOnline.mockResolvedValue([]);
  mockLikes.mockResolvedValue([]);
  mockAlive = false;
  mockAvailable = true;
  mockPlayerState.currentSongId = null;
  mockSetQueue.mockResolvedValue(true);
});

describe('widget: a tapped playlist that holds streaming entries only', () => {
  it('starts from stream links, in the playlist’s order, with the app closed', async () => {
    mockOnline.mockResolvedValue([row('saavn:1'), row('saavn:2'), row('saavn:3')]);
    const result = await playPinnedPlaylist('p1', 'Road');
    expect(result.ok).toBe(true);
    expect(result.first?.id).toBe('stream:saavn:1');
    const [songs, start, playlistId, play] = mockSetQueue.mock.calls[0];
    expect((songs as Song[]).map(s => s.id)).toEqual(['stream:saavn:1', 'stream:saavn:2', 'stream:saavn:3']);
    expect((songs as Song[]).every(s => s.audioUri?.startsWith('https://'))).toBe(true);
    expect([start, playlistId, play]).toEqual([0, 'p1', true]);
  });

  it('puts downloaded songs first, shows a streamed song the phone holds a copy of once, and keeps a dragged order', async () => {
    mockLocal.mockResolvedValue([
      song('file-a', 'file:///a.m4a', { title: 'Alpha', originId: 'saavn:1' }),
      song('file-b', 'file:///b.m4a', { title: 'Bravo' }),
    ]);
    mockOnline.mockResolvedValue([row('saavn:1', 'Alpha'), row('saavn:9', 'Zulu')]);
    mockOrder.mockResolvedValue(['stream:saavn:9', 'file-b', 'file-a']);
    await playPinnedPlaylist('p1', 'Road');
    const songs = mockSetQueue.mock.calls[0][0] as Song[];
    expect(songs.map(s => s.id)).toEqual(['stream:saavn:9', 'file-b', 'file-a']);
  });

  it('plays Liked songs from the online likes', async () => {
    mockLikes.mockResolvedValue([row('saavn:5')]);
    const result = await playPinnedPlaylist('default_liked', 'Liked songs');
    expect(result.ok).toBe(true);
    expect(mockOnline).not.toHaveBeenCalled();
  });
});

describe('widget: a tap that cannot play says so', () => {
  it('names an empty playlist', async () => {
    const result = await playPinnedPlaylist('p1', 'Sleep');
    expect(result).toEqual({ ok: false, notice: '“Sleep” has no songs yet' });
    expect(mockSetQueue).not.toHaveBeenCalled();
  });

  it('names a playlist none of whose songs can play', async () => {
    mockOnline.mockResolvedValue([row('bad:1')]);
    const result = await playPinnedPlaylist('p1', 'Sleep');
    expect(result.notice).toBe(pinnedNotice('Sleep', 1));
    expect(result.ok).toBe(false);
  });

  it('offers to open the app when the background start is refused', async () => {
    mockOnline.mockResolvedValue([row('saavn:1')]);
    mockSetQueue.mockResolvedValue(false);
    const result = await playPinnedPlaylist('p1', 'Road');
    expect(result.ok).toBe(false);
    expect(result.notice).toContain('Road');
    expect(result.noticeUri).toBe('lyricflow://widget/play?playlist=p1');
  });

  it('offers to open the app when the native player is not there', async () => {
    mockOnline.mockResolvedValue([row('saavn:1')]);
    mockAvailable = false;
    const result = await playPinnedPlaylist('p1', 'Road');
    expect(result.noticeUri).toBe('lyricflow://widget/play?playlist=p1');
    expect(mockSetQueue).not.toHaveBeenCalled();
  });
});

describe('widget: with the app running the player store takes the tap (so Connect decides where it plays)', () => {
  it('hands the queue to the store and draws the song that started', async () => {
    mockAlive = true;
    mockOnline.mockResolvedValue([row('saavn:1'), row('saavn:2')]);
    mockSetPlaylistQueue.mockImplementation((_id: string, songs: Song[]) => { mockPlayerState.currentSongId = songs[0].id; });
    const result = await playPinnedPlaylist('p1', 'Road');
    expect(mockSetQueue).not.toHaveBeenCalled();
    expect(mockSetPlaylistQueue.mock.calls[0][0]).toBe('p1');
    expect(mockSetPlaylistQueue.mock.calls[0][2]).toBe(0);
    expect(result.first?.id).toBe('stream:saavn:1');
  });

  it('draws nothing ahead when Connect sent the pick to another device', async () => {
    mockAlive = true;
    mockOnline.mockResolvedValue([row('saavn:1')]);
    const result = await playPinnedPlaylist('p1', 'Road');
    expect(mockSetPlaylistQueue).toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });
});
