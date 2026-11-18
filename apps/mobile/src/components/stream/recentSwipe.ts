/**
 * The maths of swiping Stream's Recent shelf between Songs (0) and Playlists (1): the shelf, and the header
 * switch's plate beside it, follow one position value while a finger drags, then settle on one view.
 * Pure and UI-thread safe: no outside calls, so a pan callback can use them directly.
 */

/** A flick faster than this (px/s) picks the view it points at, wherever the drag stopped. */
export const SWIPE_FLING = 500;

/** The track's position while dragging: the finger moves it a screen width per screen width, clamped to the two views. */
export function swipePosition(from: number, translationX: number, width: number): number {
  'worklet';
  if (width <= 0) return from;
  return Math.max(0, Math.min(1, from - translationX / width));
}

/** The view to settle on when the finger lifts: the flick's direction, else whichever is nearer. */
export function swipeTarget(position: number, velocityX: number): 0 | 1 {
  'worklet';
  if (velocityX <= -SWIPE_FLING) return 1;
  if (velocityX >= SWIPE_FLING) return 0;
  return position >= 0.5 ? 1 : 0;
}
