import {
  NOW_PLAYING_COMPACT_BELOW, nowPlayingLayout, PLAYLIST_GAP, PLAYLIST_PAD, playlistLayout, progressWidth, songCountLabel,
} from './widgetLayout';

/** The height the full layout draws: padding, artwork, then bar + times, a gap, transport and the gaps between rows. */
const drawnHeight = (width: number, height: number): number => {
  const layout = nowPlayingLayout(width, height);
  return layout.pad * 2 + layout.art + (layout.showTimes ? 4 + 6 + 14 : 4) + layout.playButton + 24;
};

describe('widget: now playing layout', () => {
  it('shows artwork, the times and transport on the default 3x3 widget without running out of room', () => {
    const layout = nowPlayingLayout(180, 180);
    expect(layout.showTimes).toBe(true);
    expect(layout.art).toBe(56);
    expect(drawnHeight(180, 180)).toBeLessThanOrEqual(180);
  });

  it('never draws taller than the room it is given, at any launcher size', () => {
    for (let width = 150; width <= 360; width += 30) {
      for (let height = 120; height <= 360; height += 12) {
        expect(drawnHeight(width, height)).toBeLessThanOrEqual(Math.max(height, 140));
      }
    }
  });

  it('grows the artwork with the widget, up to a limit', () => {
    expect(nowPlayingLayout(300, 300).art).toBeGreaterThan(nowPlayingLayout(180, 180).art);
    expect(nowPlayingLayout(500, 500).art).toBe(76);
  });

  it('drops the times and shrinks the controls when the widget is short', () => {
    const short = nowPlayingLayout(250, NOW_PLAYING_COMPACT_BELOW - 1);
    expect(short.showTimes).toBe(false);
    expect(short.art).toBe(40);
    expect(short.playButton).toBeLessThan(nowPlayingLayout(250, 250).playButton);
  });

  it('keeps every button a comfortable tap, and the play button the largest', () => {
    for (const [width, height] of [[180, 180], [250, 250], [320, 140]]) {
      const layout = nowPlayingLayout(width, height);
      expect(layout.button).toBeGreaterThanOrEqual(36);
      expect(layout.playButton).toBeGreaterThan(layout.button);
    }
  });

  it('keeps the bar inside the padding', () => {
    const layout = nowPlayingLayout(200, 200);
    expect(layout.barWidth + layout.pad * 2).toBeLessThanOrEqual(200);
  });
});

describe('widget: progress bar', () => {
  it('is empty until the length is known and playing has begun', () => {
    expect(progressWidth(200, 30, 0)).toBe(0);
    expect(progressWidth(200, 0, 200)).toBe(0);
  });

  it('is proportional, with a visible nub at the very start and never past the end', () => {
    expect(progressWidth(200, 100, 200)).toBe(100);
    expect(progressWidth(200, 0.1, 200)).toBe(4);
    expect(progressWidth(200, 250, 200)).toBe(200);
  });
});

describe('widget: playlist tiles', () => {
  const fits = (width: number, height: number, count: number) => {
    const layout = playlistLayout(width, height, count, false);
    expect(PLAYLIST_PAD * 2 + layout.tileW * layout.cols + PLAYLIST_GAP * (layout.cols - 1)).toBeLessThanOrEqual(width);
    expect(PLAYLIST_PAD * 2 + layout.header + layout.tileH * layout.rows + PLAYLIST_GAP * layout.rows).toBeLessThanOrEqual(Math.max(height, 200));
    return layout;
  };

  it('spreads one tile across the widget and lays two to four two across', () => {
    expect(fits(250, 220, 1).cols).toBe(1);
    expect(fits(250, 220, 2)).toMatchObject({ cols: 2, rows: 1 });
    expect(fits(250, 220, 3)).toMatchObject({ cols: 2, rows: 2 });
    expect(fits(250, 220, 4)).toMatchObject({ cols: 2, rows: 2 });
  });

  it('fits tall, wide and small widgets', () => {
    for (const [width, height] of [[250, 180], [320, 320], [400, 200]]) fits(width, height, 4);
  });

  it('leaves room for a notice under the tiles', () => {
    expect(playlistLayout(250, 240, 4, true).tileH).toBeLessThan(playlistLayout(250, 240, 4, false).tileH);
  });
});

describe('widget: song count', () => {
  it('reads 1 song / N songs', () => {
    expect(songCountLabel(1)).toBe('1 song');
    expect(songCountLabel(0)).toBe('0 songs');
    expect(songCountLabel(12)).toBe('12 songs');
  });
});
