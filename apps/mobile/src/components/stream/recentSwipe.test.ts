import { swipePosition, swipeTarget } from './recentSwipe';

describe('swiping the Recent shelf', () => {
  it('follows the finger: a swipe left carries Playlists in, a swipe right brings Songs back', () => {
    expect(swipePosition(0, -100, 400)).toBeCloseTo(0.25);
    expect(swipePosition(1, 100, 400)).toBeCloseTo(0.75);
  });

  it('never leaves the two views', () => {
    expect(swipePosition(0, 300, 400)).toBe(0);
    expect(swipePosition(1, -300, 400)).toBe(1);
    expect(swipePosition(0, -900, 400)).toBe(1);
  });

  it('holds its place before the width is known', () => {
    expect(swipePosition(1, -50, 0)).toBe(1);
  });

  it('settles on the nearer view when released slowly', () => {
    expect(swipeTarget(0.4, 0)).toBe(0);
    expect(swipeTarget(0.6, 0)).toBe(1);
    expect(swipeTarget(0.5, 0)).toBe(1);
  });

  it('lets a flick decide, even a short one', () => {
    expect(swipeTarget(0.1, -900)).toBe(1);
    expect(swipeTarget(0.9, 900)).toBe(0);
    expect(swipeTarget(0.45, 200)).toBe(0);
  });
});
