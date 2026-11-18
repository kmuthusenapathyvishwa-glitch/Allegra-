/**
 * Headless handler for both home-screen widgets: renders them from the saved
 * snapshot and answers their buttons.
 *
 * Transport buttons go where the music is: to the device that plays when another one does (Connect), otherwise to
 * the player. With the app's JS runtime alive that is the player store; with it gone (the service keeps playing after
 * the app was swiped away) the native queue engine is driven directly. A pinned playlist's tile (PLAY_PLAYLIST) plays
 * even from a cold start, without opening the app: the headless task hands the songs to the native queue engine.
 * "Now playing" is a deep link that opens the app.
 */
import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { actWhereMusicIs } from '../services/connect/playbackIntents';
import { NowPlayingWidget, PlaylistWidget } from './SongWidget';
import { readSnapshot, widgetCover, writeSnapshot, WidgetSnapshot } from './widgetData';

export const WIDGET_NOW_PLAYING = 'NowPlaying';
export const WIDGET_PLAYLIST = 'Playlist';

const render = (props: WidgetTaskHandlerProps, snapshot: WidgetSnapshot) => {
  const { widgetInfo } = props;
  if (widgetInfo.widgetName === WIDGET_PLAYLIST) {
    props.renderWidget(<PlaylistWidget snapshot={snapshot} width={widgetInfo.width} height={widgetInfo.height} />);
  } else {
    props.renderWidget(<NowPlayingWidget snapshot={snapshot} width={widgetInfo.width} height={widgetInfo.height} />);
  }
};

/**
 * The player is not loaded in this JS runtime (the app was swiped away; the playback service plays on): the buttons
 * drive the native engine, which still holds the queue. Liking needs the library, so it waits for the app.
 */
const actNative = async (action: string, snapshot: WidgetSnapshot): Promise<WidgetSnapshot> => {
  const { NativeAudioPlayer } = await import('../services/NativeAudioPlayer');
  if (!NativeAudioPlayer.isAvailable()) return snapshot;
  const { nativeQueue } = await import('../playback/nativeQueue');
  switch (action) {
    case 'TOGGLE_PLAY':
      if (snapshot.isPlaying) {
        NativeAudioPlayer.pause();
        return { ...snapshot, isPlaying: false };
      }
      return NativeAudioPlayer.play() ? { ...snapshot, isPlaying: true } : snapshot;
    case 'NEXT':
      await nativeQueue.next().catch(() => false);
      return snapshot;
    case 'PREVIOUS':
      await nativeQueue.previous().catch(() => false);
      return snapshot;
    default:
      return snapshot;
  }
};

/** Runs a transport action: on the player when it is loaded in this JS runtime, on the engine otherwise. */
export const act = async (action: string, snapshot: WidgetSnapshot): Promise<WidgetSnapshot> => {
  const { usePlayerStore } = await import('../store/playerStore');
  const player = usePlayerStore.getState();
  if (!player.currentSong) return actNative(action, snapshot);
  switch (action) {
    case 'TOGGLE_PLAY': {
      const next = !player.isPlaying;
      const where = await actWhereMusicIs({ kind: next ? 'play' : 'pause' }, () => player.requestPlayback(next));
      // Another device took it: its state arrives through Connect, so nothing is drawn ahead of it.
      return where === 'here' ? { ...snapshot, isPlaying: next } : snapshot;
    }
    case 'NEXT':
      await actWhereMusicIs({ kind: 'next' }, () => { player.nextInPlaylist().catch(() => undefined); });
      return snapshot;
    case 'PREVIOUS':
      await actWhereMusicIs({ kind: 'prev' }, () => player.previousInPlaylist());
      return snapshot;
    case 'TOGGLE_LIKE': {
      const { useSongsStore } = await import('../store/songsStore');
      await useSongsStore.getState().toggleLike(player.currentSong.id);
      return { ...snapshot, liked: !snapshot.liked };
    }
    default:
      return snapshot;
  }
};

/** A pinned playlist's tile: plays it, and says why in the footer when it could not. */
export const playTile = async (data: { playlistId?: unknown; name?: unknown }, snapshot: WidgetSnapshot): Promise<WidgetSnapshot> => {
  const playlistId = typeof data.playlistId === 'string' ? data.playlistId : '';
  if (!playlistId) return snapshot;
  const name = typeof data.name === 'string' ? data.name : 'this playlist';
  const { playPinnedPlaylist } = await import('./playPinned');
  const result = await playPinnedPlaylist(playlistId, name).catch(() => ({
    ok: false as const,
    notice: `Couldn’t start “${name}”`,
    first: undefined,
    noticeUri: undefined,
  }));
  if (result.ok && result.first) {
    return {
      ...snapshot,
      notice: null,
      noticeUri: null,
      isPlaying: true,
      position: 0,
      song: { id: result.first.id, title: result.first.title, artist: result.first.artist ?? '', cover: widgetCover(result.first.coverImageUri) },
    };
  }
  return { ...snapshot, notice: result.ok ? null : result.notice ?? null, noticeUri: result.ok ? null : result.noticeUri ?? null };
};

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  let snapshot = await readSnapshot();
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      render(props, snapshot);
      break;
    case 'WIDGET_CLICK': {
      const action = props.clickAction ?? '';
      if (action === 'PLAY_PLAYLIST') {
        // A pinned playlist: it plays here, in the background, without opening the app (1.41.0).
        snapshot = await playTile((props.clickActionData ?? {}) as { playlistId?: unknown; name?: unknown }, snapshot);
        await writeSnapshot(snapshot);
      } else {
        snapshot = await act(action, snapshot).catch(() => snapshot);
      }
      render(props, snapshot);
      break;
    }
    default:
      break;
  }
}
