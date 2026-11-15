export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function titleAccent(title: string): string {
  let hash = 0;
  for (const character of title) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const accents = ['#a7e1ff', '#62b4ff', '#6e9dff', '#8fa3ff', '#b9d8ff'];
  return accents[hash % accents.length] ?? accents[0];
}

/** Credited names on a song line ("A, B & C feat. D"), in order. */
export { creditedArtists } from '@shared/identity';
