/**
 * A pinned playlist tapped on the home-screen widget plays at once, without opening the app (1.41.0).
 *
 * The widget's click runs in the app's headless JS task: with the app closed there is no screen, so the Kotlin queue
 * engine is handed the playlist directly (it starts the playback service, which posts the media notification). With
 * the app alive the player store takes it, as a tap in the app would, and Connect decides where it plays.
 *
 * The queue is the playlist page's own list: songs on this phone, then the streaming entries (a playlist built on the
 * website or another device) as Allegra stream links, in the order the listener last dragged them into. 1.70.0: it
 * used to take only downloaded songs, so a synced playlist showed "12 songs" on its tile and played nothing.
 */
import type { Song } from '../types/song';
import { widgetLink } from './widgetData';

/** An address the player can load: a file or content address on the phone, or a stream link. */
export const hasPlayableAddress = (song: Pick<Song, 'audioUri'>): boolean =>
  typeof song.audioUri === 'string' && /^(file|content|https?):/i.test(song.audioUri);

export interface PinnedPlayResult {
  ok: boolean;
  /** The song that starts here, for the widget's next frame. Absent when Connect sent the pick to another device. */
  first?: Song;
  /** Why nothing played, as widget copy. */
  notice?: string;
  /** Where tapping that notice goes: the app starts the playlist itself. */
  noticeUri?: string;
}

/** What to play for a pinned playlist, in the playlist's order: every song with an address the player can load. */
export const pinnedQueue = (songs: readonly Song[]): Song[] => songs.filter(s => !s.isHidden && hasPlayableAddress(s));

/** The two lines a tap that played nothing can end in. */
export const pinnedNotice = (name: string, songCount: number): string =>
  songCount === 0 ? `“${name}” has no songs yet` : `“${name}” can’t play right now`;

/**
 * Every song of a playlist as its page lists it (downloaded songs, then streaming entries the phone holds no copy of,
 * in the saved order). Streaming entries become stream links straight away: Allegra's stream route finds the audio.
 */
export const loadPinnedSongs = async (playlistId: string): Promise<Song[]> => {
  const [{ getPlaylistSongs, getPlaylistItemOrder }, { getOnlineLikes, getOnlinePlaylistSongs }, { LIKED_PLAYLIST_ID }] = await Promise.all([
    import('../database/playlistQueries'),
    import('../database/syncQueries'),
    import('../services/sync/plan'),
  ]);
  const [local, rows, order] = await Promise.all([
    getPlaylistSongs(playlistId).catch(() => [] as Song[]),
    (playlistId === LIKED_PLAYLIST_ID ? getOnlineLikes() : getOnlinePlaylistSongs(playlistId)).catch(() => []),
    getPlaylistItemOrder(playlistId).catch(() => [] as string[]),
  ]);
  const [{ withoutCopies }, { onlineRowToSong, instantStreamSong }, { applySavedOrder }] = await Promise.all([
    import('../services/offlinePlaylistPlan'),
    import('../services/sync/onlineSongs'),
    import('../components/playlist/playlistReorder'),
  ]);
  // An entry that names no catalog song stays in the list without an address, so "can't play" is told from "empty".
  const online = withoutCopies(local, rows).map(row => {
    const entry = onlineRowToSong(row);
    return instantStreamSong(entry) ?? entry;
  });
  return applySavedOrder([...local, ...online], order);
};

const refused = (playlistId: string, name: string): PinnedPlayResult => ({
  ok: false,
  notice: `Couldn’t start “${name}”. Tap to open`,
  noticeUri: widgetLink.playPlaylist(playlistId),
});

export const playPinnedPlaylist = async (playlistId: string, name: string): Promise<PinnedPlayResult> => {
  const all = await loadPinnedSongs(playlistId).catch(() => [] as Song[]);
  const songs = pinnedQueue(all);
  if (songs.length === 0) return { ok: false, notice: pinnedNotice(name, all.length) };
  const { usePlayerStore, usesNativeQueue } = await import('../store/playerStore');
  if (usesNativeQueue()) {
    // The app is running: the store routes it (Connect included) and its screens follow.
    usePlayerStore.getState().setPlaylistQueue(playlistId, songs, 0);
    // Connect may have sent the pick to the device that is playing: nothing started here, so nothing to draw.
    return usePlayerStore.getState().currentSongId === songs[0].id ? { ok: true, first: songs[0] } : { ok: true };
  }
  // Cold start in the headless task: the engine holds the queue; the app reads it back when it next opens.
  const { nativeQueue } = await import('../playback/nativeQueue');
  if (!nativeQueue.available()) return refused(playlistId, name);
  const started = await nativeQueue.setQueue(songs, 0, playlistId, true).catch(() => false);
  return started ? { ok: true, first: songs[0] } : refused(playlistId, name);
};
