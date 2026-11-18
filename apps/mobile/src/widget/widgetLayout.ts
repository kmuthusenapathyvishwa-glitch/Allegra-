/**
 * Sizes for the home-screen widgets, worked out from the room the launcher gives them (dp). Pure, so the layout can
 * be proven without a phone: `SongWidget.tsx` only draws what this says.
 */

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

export interface NowPlayingLayout {
  readonly pad: number;
  /** Artwork edge. */
  readonly art: number;
  readonly artRadius: number;
  /** Previous / next / like. */
  readonly button: number;
  readonly playButton: number;
  readonly icon: number;
  readonly playIcon: number;
  /** Gap between transport buttons. */
  readonly gap: number;
  /** The progress bar's length. */
  readonly barWidth: number;
  /** Elapsed and remaining time under the bar. Left out when the widget is short. */
  readonly showTimes: boolean;
}

/** Height the full layout needs besides the artwork: bar + times, transport and the gaps between the three rows. */
const FULL_ROWS = 4 + 6 + 14 + 12 + 12 + 48;
/** Below this the widget drops the times and shrinks to artwork, bar and transport. */
export const NOW_PLAYING_COMPACT_BELOW = 176;

export const nowPlayingLayout = (width: number, height: number): NowPlayingLayout => {
  const compact = height < NOW_PLAYING_COMPACT_BELOW || width < 150;
  const pad = compact ? 12 : 14;
  const inner = Math.max(96, Math.floor(width - pad * 2));
  if (compact) {
    return { pad, art: 40, artRadius: 9, button: 36, playButton: 42, icon: 16, playIcon: 20, gap: 12, barWidth: inner, showTimes: false };
  }
  const art = clamp(Math.floor(height - pad * 2 - FULL_ROWS), 52, 76);
  return { pad, art, artRadius: Math.round(art * 0.22), button: 40, playButton: 48, icon: 18, playIcon: 22, gap: 20, barWidth: inner, showTimes: true };
};

/** The filled part of the bar, in dp: nothing while the length is unknown, a little nub once playing has started. */
export const progressWidth = (barWidth: number, position: number, duration: number): number => {
  if (!(duration > 0) || !(position > 0)) return 0;
  return Math.max(4, Math.round(barWidth * clamp(position / duration, 0, 1)));
};

export interface PlaylistLayout {
  readonly cols: number;
  readonly rows: number;
  readonly tileW: number;
  readonly tileH: number;
  readonly header: number;
}

export const PLAYLIST_PAD = 12;
export const PLAYLIST_GAP = 8;
const PLAYLIST_HEADER = 44;
const NOTICE_ROW = 20;

/** Up to four tiles: a single one spans the widget, two to four sit two across. */
export const playlistLayout = (width: number, height: number, count: number, hasNotice: boolean): PlaylistLayout => {
  const cols = count > 1 ? 2 : 1;
  const rows = count > 2 ? 2 : 1;
  const footer = hasNotice ? NOTICE_ROW : 0;
  const tileW = Math.max(64, Math.floor((width - PLAYLIST_PAD * 2 - PLAYLIST_GAP * (cols - 1)) / cols));
  const tileH = Math.max(56, Math.floor((height - PLAYLIST_PAD * 2 - PLAYLIST_HEADER - footer - PLAYLIST_GAP * rows) / rows));
  return { cols, rows, tileW, tileH, header: PLAYLIST_HEADER };
};

/** "1 song" / "12 songs". */
export const songCountLabel = (count: number): string => `${count} ${count === 1 ? 'song' : 'songs'}`;
