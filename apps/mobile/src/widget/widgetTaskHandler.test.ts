/**
 * What a tap on the home-screen widgets does, and what the widgets draw. The Android widget library is replaced by
 * plain tags, so the trees can be read without a phone; nothing here claims a launcher was checked.
 */
import * as fs from 'fs';
import * as path from 'path';
import React from 'react';

const mockWrite = jest.fn();
const mockPlayPinned = jest.fn();
const mockWhere = jest.fn();
const mockRequestPlayback = jest.fn();
const mockNext = jest.fn(async () => undefined);
const mockPrevious = jest.fn();
const mockPlayer: { currentSong: { id: string } | null; isPlaying: boolean } = { currentSong: { id: 's1' }, isPlaying: true };
const mockNative = { isAvailable: jest.fn(() => true), play: jest.fn(() => true), pause: jest.fn() };
const mockQueueNext = jest.fn(async () => true);
const mockQueuePrevious = jest.fn(async () => true);
let mockStored: string | null = null;

jest.mock('react-native-android-widget', () => ({
  FlexWidget: 'FlexWidget', TextWidget: 'TextWidget', ImageWidget: 'ImageWidget', OverlapWidget: 'OverlapWidget', SvgWidget: 'SvgWidget',
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => mockStored),
  setItem: jest.fn(async (_key: string, value: string) => { mockWrite(JSON.parse(value)); mockStored = value; }),
}));
jest.mock('../services/connect/playbackIntents', () => ({ actWhereMusicIs: (...args: unknown[]) => mockWhere(...args) }));
jest.mock('./playPinned', () => ({ playPinnedPlaylist: (...args: unknown[]) => mockPlayPinned(...args) }));
jest.mock('../store/playerStore', () => ({
  usePlayerStore: { getState: () => ({ ...mockPlayer, requestPlayback: mockRequestPlayback, nextInPlaylist: mockNext, previousInPlaylist: mockPrevious }) },
}));
jest.mock('../services/NativeAudioPlayer', () => ({ NativeAudioPlayer: mockNative }));
jest.mock('../playback/nativeQueue', () => ({ nativeQueue: { next: () => mockQueueNext(), previous: () => mockQueuePrevious() } }));

import { act, playTile, widgetTaskHandler } from './widgetTaskHandler';
import { NowPlayingWidget, PlaylistWidget } from './SongWidget';
import { EMPTY_SNAPSHOT, type WidgetSnapshot } from './widgetData';

interface Node { type: string; props: Record<string, unknown>; children: Node[]; text?: string }

/** Draws a widget tree down to its tags: function components run, text stays text. */
const expand = (element: unknown): Node[] => {
  if (element === null || element === undefined || typeof element === 'boolean') return [];
  if (Array.isArray(element)) return element.flatMap(expand);
  if (typeof element === 'string' || typeof element === 'number') return [{ type: '#text', props: {}, children: [], text: String(element) }];
  if (!React.isValidElement(element)) return [];
  const { type, props } = element as { type: unknown; props: Record<string, unknown> };
  if (typeof type === 'function') return expand((type as (p: unknown) => unknown)(props));
  return [{ type: String(type), props, children: expand(props.children) }];
};
const walk = (nodes: Node[]): Node[] => nodes.flatMap(node => [node, ...walk(node.children)]);
const draw = (element: unknown): Node[] => walk(expand(element));
const textsOf = (nodes: Node[]): string[] => nodes.filter(n => n.type === 'TextWidget').map(n => String(n.props.text));
const actionsOf = (nodes: Node[]): string[] => nodes.flatMap(n => (typeof n.props.clickAction === 'string' ? [n.props.clickAction] : []));

const playing: WidgetSnapshot = {
  ...EMPTY_SNAPSHOT,
  song: { id: 's1', title: 'Tum Hi Ho', artist: 'Arijit Singh' },
  isPlaying: true, liked: true, position: 83, duration: 262,
  pinned: [
    { id: 'p1', name: 'Road', songCount: 12 }, { id: 'p2', name: 'Sleep', songCount: 1 },
    { id: 'p3', name: 'Focus', songCount: 40, cover: 'https://img/f.jpg' }, { id: 'p4', name: 'Gym', songCount: 0 },
  ],
  pinnedChosen: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockStored = null;
  mockPlayer.currentSong = { id: 's1' };
  mockPlayer.isPlaying = true;
  mockWhere.mockImplementation(async (_remote: unknown, here: () => void) => { here(); return 'here'; });
  mockNative.isAvailable.mockReturnValue(true);
  mockNative.play.mockReturnValue(true);
});

describe('widget: tapping a playlist tile', () => {
  it('draws one tile per pinned playlist, each answering a tap with that playlist', () => {
    const tiles = draw(React.createElement(PlaylistWidget, { snapshot: playing, width: 250, height: 240 })).filter(n => n.props.clickAction === 'PLAY_PLAYLIST');
    expect(tiles.map(n => n.props.clickActionData)).toEqual([
      { playlistId: 'p1', name: 'Road' }, { playlistId: 'p2', name: 'Sleep' }, { playlistId: 'p3', name: 'Focus' }, { playlistId: 'p4', name: 'Gym' },
    ]);
  });

  it('writes the song that started into the snapshot, and clears an old notice', async () => {
    mockPlayPinned.mockResolvedValue({ ok: true, first: { id: 'a', title: 'Alpha', artist: 'Artist', coverImageUri: 'https://img/a.jpg' } });
    const next = await playTile({ playlistId: 'p1', name: 'Road' }, { ...playing, notice: 'old', noticeUri: 'lyricflow://x' });
    expect(mockPlayPinned).toHaveBeenCalledWith('p1', 'Road');
    expect(next).toMatchObject({ isPlaying: true, position: 0, notice: null, noticeUri: null, song: { id: 'a', title: 'Alpha', cover: 'https://img/a.jpg' } });
  });

  it('keeps the current frame when Connect took the pick', async () => {
    mockPlayPinned.mockResolvedValue({ ok: true });
    const next = await playTile({ playlistId: 'p1', name: 'Road' }, playing);
    expect(next.song).toEqual(playing.song);
    expect(next.notice).toBeNull();
  });

  it('puts the reason in the footer, tappable when the app can start it', async () => {
    mockPlayPinned.mockResolvedValue({ ok: false, notice: 'Couldn’t start “Road”. Tap to open', noticeUri: 'lyricflow://widget/play?playlist=p1' });
    const next = await playTile({ playlistId: 'p1', name: 'Road' }, playing);
    expect(next.notice).toBe('Couldn’t start “Road”. Tap to open');
    const footer = draw(React.createElement(PlaylistWidget, { snapshot: next, width: 250, height: 240 })).filter(n => n.props.clickAction === 'OPEN_URI' && n.props.accessibilityLabel === next.notice);
    expect(footer).toHaveLength(1);
    expect(footer[0].props.clickActionData).toEqual({ uri: 'lyricflow://widget/play?playlist=p1' });
  });

  it('survives a failure inside the start and still says something', async () => {
    mockPlayPinned.mockRejectedValue(new Error('boom'));
    const next = await playTile({ playlistId: 'p1', name: 'Road' }, playing);
    expect(next.notice).toContain('Road');
  });

  it('ignores a tile with no playlist id', async () => {
    expect(await playTile({}, playing)).toBe(playing);
    expect(mockPlayPinned).not.toHaveBeenCalled();
  });

  it('handles the click end to end: starts it, saves the snapshot, redraws the widget', async () => {
    mockPlayPinned.mockResolvedValue({ ok: true, first: { id: 'a', title: 'Alpha', artist: 'Artist' } });
    mockStored = JSON.stringify(playing);
    const rendered: unknown[] = [];
    await widgetTaskHandler({
      widgetAction: 'WIDGET_CLICK', clickAction: 'PLAY_PLAYLIST', clickActionData: { playlistId: 'p1', name: 'Road' },
      widgetInfo: { widgetName: 'Playlist', widgetId: 1, width: 250, height: 240 },
      renderWidget: (element: unknown) => { rendered.push(element); },
    } as never);
    expect(mockWrite).toHaveBeenCalledWith(expect.objectContaining({ song: expect.objectContaining({ id: 'a' }), isPlaying: true }));
    expect(rendered).toHaveLength(1);
    expect(textsOf(draw(rendered[0]))).toContain('Alpha');
  });
});

describe('widget: transport buttons', () => {
  it('sends play / pause where the music is, and flips the button only when it plays here', async () => {
    const paused = await act('TOGGLE_PLAY', playing);
    expect(mockWhere).toHaveBeenCalledWith({ kind: 'pause' }, expect.any(Function));
    expect(mockRequestPlayback).toHaveBeenCalledWith(false);
    expect(paused.isPlaying).toBe(false);

    mockWhere.mockResolvedValue('remote');
    mockRequestPlayback.mockClear();
    const remote = await act('TOGGLE_PLAY', playing);
    expect(mockRequestPlayback).not.toHaveBeenCalled();
    expect(remote.isPlaying).toBe(true);
  });

  it('sends next and previous through the same routing', async () => {
    await act('NEXT', playing);
    await act('PREVIOUS', playing);
    expect(mockWhere).toHaveBeenNthCalledWith(1, { kind: 'next' }, expect.any(Function));
    expect(mockWhere).toHaveBeenNthCalledWith(2, { kind: 'prev' }, expect.any(Function));
    expect(mockNext).toHaveBeenCalled();
    expect(mockPrevious).toHaveBeenCalled();
  });

  it('drives the native engine when the app’s player is not loaded (the service plays on after a swipe away)', async () => {
    mockPlayer.currentSong = null;
    await act('NEXT', playing);
    await act('PREVIOUS', playing);
    expect(mockQueueNext).toHaveBeenCalled();
    expect(mockQueuePrevious).toHaveBeenCalled();
    expect(mockWhere).not.toHaveBeenCalled();
    expect((await act('TOGGLE_PLAY', playing)).isPlaying).toBe(false);
    expect(mockNative.pause).toHaveBeenCalled();
    expect((await act('TOGGLE_PLAY', { ...playing, isPlaying: false })).isPlaying).toBe(true);
    expect(mockNative.play).toHaveBeenCalled();
  });

  it('leaves the button as it was when there is no player to start', async () => {
    mockPlayer.currentSong = null;
    mockNative.play.mockReturnValue(false);
    expect((await act('TOGGLE_PLAY', { ...playing, isPlaying: false })).isPlaying).toBe(false);
  });

  it('the now playing widget draws previous, play / pause and next, each with its own action', () => {
    const nodes = draw(React.createElement(NowPlayingWidget, { snapshot: playing, width: 180, height: 180 }));
    expect(actionsOf(nodes)).toEqual(expect.arrayContaining(['PREVIOUS', 'TOGGLE_PLAY', 'NEXT', 'TOGGLE_LIKE']));
    const paused = draw(React.createElement(NowPlayingWidget, { snapshot: { ...playing, isPlaying: false }, width: 180, height: 180 }));
    expect(paused.find(n => n.props.clickAction === 'TOGGLE_PLAY')?.props.accessibilityLabel).toBe('Play');
    expect(nodes.find(n => n.props.clickAction === 'TOGGLE_PLAY')?.props.accessibilityLabel).toBe('Pause');
  });
});

describe('widget: what it says', () => {
  it('shows the song, the artist, the elapsed and the remaining time', () => {
    const texts = textsOf(draw(React.createElement(NowPlayingWidget, { snapshot: playing, width: 180, height: 180 })));
    expect(texts).toEqual(expect.arrayContaining(['Tum Hi Ho', 'Arijit Singh', '1:23', '-2:59']));
  });

  it('drops the times on a short widget', () => {
    const texts = textsOf(draw(React.createElement(NowPlayingWidget, { snapshot: playing, width: 250, height: 140 })));
    expect(texts).toEqual(['Tum Hi Ho', 'Arijit Singh']);
  });

  it('has short, plain empty states and no hint text', () => {
    const idle = textsOf(draw(React.createElement(NowPlayingWidget, { snapshot: EMPTY_SNAPSHOT, width: 180, height: 180 })));
    expect(idle).toEqual(['Nothing playing']);
    const none = textsOf(draw(React.createElement(PlaylistWidget, { snapshot: EMPTY_SNAPSHOT, width: 250, height: 240 })));
    expect(none).toEqual(['No playlists yet']);
    const tiles = textsOf(draw(React.createElement(PlaylistWidget, { snapshot: { ...playing, song: null }, width: 250, height: 240 })));
    expect(tiles).toEqual(['Playlists', 'Road', '12 songs', 'Sleep', '1 song', 'Focus', '40 songs', 'Gym', '0 songs']);
  });
});

describe('widget: design rules (the owner’s unslop pass, 1.70.0)', () => {
  const source = fs.readFileSync(path.join(__dirname, 'SongWidget.tsx'), 'utf8');
  const theme = fs.readFileSync(path.join(__dirname, '..', 'constants', 'widgetTheme.ts'), 'utf8');

  it('carries no placeholder copy', () => {
    for (const phrase of ['Tap to open LuvLyrics', 'Make one in LuvLyrics', 'Tap a playlist to play it', 'Pin playlists in Settings']) {
      expect(source).not.toContain(phrase);
    }
  });

  it('types no colour of its own: every colour is a WidgetColor token', () => {
    expect(source).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    expect(source).not.toMatch(/rgba?\(/);
  });

  it('has no muddy purple gradients, and keeps the neutral darks', () => {
    for (const muddy of ['#24202C', '#3A2F4A', '#4A3558', '#101114']) {
      expect(source + theme).not.toContain(muddy);
    }
    expect(theme).toContain("surface: '#0D0E11'");
    expect(theme).toContain("raised: '#14161B'");
    expect(theme).toContain("glass: 'rgba(255, 255, 255, 0.06)'");
    expect(theme).toContain("ink: '#EDEDED'");
    expect(theme).toContain("inkMuted: '#8E929B'");
  });
});
