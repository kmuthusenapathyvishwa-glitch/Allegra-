/**
 * The home-screen widgets' look, in one place. Widgets draw with RemoteViews (react-native-android-widget), so they
 * cannot use `src/ui` or `allegraTheme` (which pulls in Reanimated): these are the same neutrals written out, and
 * nothing in `SongWidget.tsx` types a colour of its own.
 *
 * Deep true-neutral darks, one translucent layer for controls, and two inks. No gradients behind artwork except a
 * plain fade for legibility, and no colour except the like heart.
 */
import type { ColorProp } from 'react-native-android-widget';

export const WidgetColor: Readonly<Record<
  'surface' | 'raised' | 'clear' | 'glass' | 'glassStrong' | 'track' | 'ink' | 'inkMuted' | 'liked' | 'fadeClear' | 'fadeDeep',
  ColorProp
>> = {
  /** The card. */
  surface: '#0D0E11',
  /** Something sitting on the card: a cover with no picture, a tile. */
  raised: '#14161B',
  /** A button with no fill of its own (the like heart). */
  clear: 'rgba(255, 255, 255, 0)',
  /** Round buttons at rest. */
  glass: 'rgba(255, 255, 255, 0.06)',
  /** The play button: one step lighter than its neighbours, never a bright disc. */
  glassStrong: 'rgba(255, 255, 255, 0.1)',
  /** The empty part of the progress bar. */
  track: 'rgba(255, 255, 255, 0.14)',
  ink: '#EDEDED',
  inkMuted: '#8E929B',
  liked: '#EE6B5F',
  /** The foot of a playlist tile: from nothing to the card's own dark, so the name reads on any cover. */
  fadeClear: 'rgba(13, 14, 17, 0)',
  fadeDeep: 'rgba(13, 14, 17, 0.8)',
};

/** Material You and One UI both round a widget at 28dp. */
export const WIDGET_RADIUS = 28;
export const TILE_RADIUS = 16;
