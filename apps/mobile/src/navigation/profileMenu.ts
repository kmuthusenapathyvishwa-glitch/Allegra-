/**
 * The profile menu (1.42.0): what the You tab held, opened from your picture at the top left of Stream, Search and
 * Library, as Spotify's profile menu is. Pure data and labels, so the order and the names are tested.
 * Blends and LuvLink live in the Create sheet and Connect devices in the Stream header, so they are not repeated here.
 */
import type { IconName } from '../ui';

export type ProfileAction = 'about' | 'stats' | 'downloads' | 'import' | 'settings';

export interface ProfileItem {
  id: ProfileAction;
  title: string;
  subtitle?: string;
  icon: IconName;
}

export interface ProfileGroup {
  label: string;
  items: readonly ProfileItem[];
}

export const PROFILE_GROUPS: readonly ProfileGroup[] = [
  { label: 'Listening', items: [
    // 1.45.0 (owner): Spotify keeps its stats to a glance; ours are free and full, in the same place.
    { id: 'stats', title: 'Listening stats', subtitle: 'Your top songs, artists and habits', icon: 'stats-chart-outline' },
    { id: 'downloads', title: 'Downloads', subtitle: 'Songs saved on this phone for offline', icon: 'download-outline' },
    { id: 'import', title: 'Import from Spotify', subtitle: 'Bring your playlists and likes here', icon: 'cloud-download-outline' },
  ] },
  { label: 'App', items: [
    { id: 'settings', title: 'Settings and privacy', subtitle: 'Playback, lyrics, look, privacy and what is saved', icon: 'settings-outline' },
  ] },
];

/** The picture's TalkBack name. The release gate (mobile-launch-check.sh) finds the menu by "Profile and settings". */
export const profileButtonLabel = (updateWaiting: boolean): string =>
  updateWaiting ? 'Profile and settings, update available' : 'Profile and settings';

/** The About row's name. The release gate taps "About LuvLyrics…" to reach the Updates panel. */
export const aboutRowTitle = (updateWaiting: boolean): string =>
  updateWaiting ? 'About LuvLyrics, update available' : 'About LuvLyrics';

/** The letter on the picture: the first letter of your name, or none (a person glyph) when signed out. */
export const profileInitial = (displayName?: string | null): string | null => {
  const first = displayName?.trim().match(/\p{L}|\p{N}/u)?.[0];
  return first ? first.toUpperCase() : null;
};
