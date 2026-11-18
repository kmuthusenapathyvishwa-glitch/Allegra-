jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('react-native', () => ({ AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) } }));

import { widgetPins, type WidgetPlaylist } from './widgetData';
import { pinnedQueue } from './playPinned';
import { normalizeLibraryStartTab, normalizePinnedPlaylists, togglePinnedPlaylist, WIDGET_PIN_LIMIT } from '../store/settingsStore';
import { holdTabFor, holdTarget, TAB_HOLD_MS } from '../navigation/tabHold';
import { holdSummary, pinnedSummary } from '../components/settings/shortcutSummary';
import type { Song } from '../types/song';

const playlist = (id: string, name = id): WidgetPlaylist => ({ id, name, songCount: 3, songs: [] });
const song = (id: string, audioUri?: string, extra: Partial<Song> = {}): Song => ({
  id, title: id, gradientId: '1', duration: 1, dateCreated: '', dateModified: '', playCount: 0, lyrics: [], audioUri, ...extra,
});

describe('widget: pinned playlists (1.41.0)', () => {
  const all = ['a', 'b', 'c', 'd', 'e'].map(id => playlist(id));

  it('shows the pinned playlists in the order they were pinned', () => {
    expect(widgetPins(['c', 'a'], all)).toEqual({ pins: [expect.objectContaining({ id: 'c' }), expect.objectContaining({ id: 'a' })], chosen: true });
  });

  it('drops pins whose playlist was deleted', () => {
    expect(widgetPins(['gone', 'b'], all).pins.map(p => p.id)).toEqual(['b']);
  });

  it('shows the first four playlists until some are pinned, and says they were not chosen', () => {
    const { pins, chosen } = widgetPins([], all);
    expect(pins.map(p => p.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(chosen).toBe(false);
  });

  it('pins at most four, unique, and a second tap unpins', () => {
    expect(normalizePinnedPlaylists(['a', 'a', 'b', 'c', 'd', 'e', 7])).toEqual(['a', 'b', 'c', 'd']);
    expect(normalizePinnedPlaylists('nope')).toEqual([]);
    expect(togglePinnedPlaylist(['a', 'b', 'c', 'd'], 'e')).toHaveLength(WIDGET_PIN_LIMIT);
    expect(togglePinnedPlaylist(['a', 'b'], 'a')).toEqual(['b']);
    expect(togglePinnedPlaylist(['a'], 'b')).toEqual(['a', 'b']);
  });

  it('plays downloaded and streamed songs in order, and leaves out hidden ones and ones with no address', () => {
    const queue = pinnedQueue([song('a', 'file:///a'), song('b', 'https://cdn/b'), song('c'), song('d', 'file:///d', { isHidden: true }), song('e', 'content://media/e')]);
    expect(queue.map(s => s.id)).toEqual(['a', 'b', 'e']);
  });
});

describe('Library shortcuts (1.41.0)', () => {
  it('opens on the chosen tab, Songs for anything unknown', () => {
    expect(normalizeLibraryStartTab('Playlists')).toBe('Playlists');
    expect(normalizeLibraryStartTab('Home')).toBe('Songs');
    expect(normalizeLibraryStartTab(undefined)).toBe('Songs');
  });

  it('holds for two seconds, and only Library answers a hold, only with a playlist that exists', () => {
    expect(TAB_HOLD_MS).toBe(2000);
    expect(holdTabFor('sleep', ['sleep'])).toBe('Library');
    expect(holdTabFor('sleep', ['other'])).toBeNull();
    expect(holdTabFor(null, ['sleep'])).toBeNull();
    expect(holdTarget('Library', 'sleep', ['sleep'])).toBe('sleep');
    expect(holdTarget('Stream', 'sleep', ['sleep'])).toBeNull();
  });

  it('describes the settings in words', () => {
    const names = new Map([['sleep', 'Sleep'], ['focus', 'Focus']]);
    expect(holdSummary('sleep', names)).toBe('Sleep');
    expect(holdSummary('gone', names)).toBe('Off');
    expect(holdSummary(null, names)).toBe('Off');
    expect(pinnedSummary(['focus', 'gone', 'sleep'], names)).toBe('Focus, Sleep');
    expect(pinnedSummary([], names)).toBe('None yet');
  });
});
