const mockFoundOnline = jest.fn().mockResolvedValue(null);
jest.mock('./lyrics/foundOnlineLyricsApi', () => ({
  fetchFoundOnlineLyrics: (...args: unknown[]) => mockFoundOnline(...args),
}));

import { getLyricsFriendlyError, lyricaService } from './LyricaService';
import { continuePlainLyrics, plainLyricsScroll } from '@shared/plainLyrics';
import { EchoLyricsCascade } from './lyrics/EchoLyricsCascade';

afterEach(() => {
  jest.restoreAllMocks();
  mockFoundOnline.mockReset().mockResolvedValue(null);
});

describe('plain lyrics', () => {
  it('preserves words without inventing sung-line times', () => {
    const lines = lyricaService.parseLrc('First line\n\nSecond line', 210);
    expect(lines.map(line => line.timestamp)).toEqual([0, 0]);
    expect(lines.map(line => line.text)).toEqual(['First line', 'Second line']);
  });
  it('keeps real line timings intact', () => {
    expect(lyricaService.parseLrc('[00:12.00]First line\n[00:17.00]Second line').map(line => line.timestamp)).toEqual([12, 17]);
  });
  it('scrolls proportionally after the intro, independently of the number of words', () => {
    expect(plainLyricsScroll(110, 210, 1600, 600)).toBe(500);
    expect(plainLyricsScroll(2, 210, 1600, 600)).toBe(0);
    expect(plainLyricsScroll(210, 210, 1600, 600)).toBe(1000);
  });
  it('continues from the place the reader scrolled to, without jumping back', () => {
    expect(continuePlainLyrics(110, 210, 1600, 600, 110, 800)).toBe(800);
    expect(continuePlainLyrics(120, 210, 1600, 600, 110, 800)).toBe(850);
    expect(continuePlainLyrics(6, 210, 1600, 600, 4, 500)).toBe(510);
  });
});

describe('Found online fallback', () => {
  it('asks the Allegra endpoint after the mobile lookup and returns its plain result last', async () => {
    jest.spyOn(EchoLyricsCascade, 'fetchBest').mockResolvedValue(null);
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const online = { type: 'plain' as const, result: { lyrics: 'Website words', source: 'Found online' } };
    mockFoundOnline.mockResolvedValue(online);

    await expect(lyricaService.fetchLyrics('Song', 'Artist', false, 180, {
      ref: 'saavn:track-1', album: 'Album', language: 'tamil',
    })).resolves.toEqual(online.result);
    expect(mockFoundOnline).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Song', artist: 'Artist', duration: 180, ref: 'saavn:track-1', album: 'Album', language: 'tamil',
    }));
  });

  it('does not wait out a sleeping backend for the website lyrics', async () => {
    jest.useFakeTimers();
    try {
      jest.spyOn(EchoLyricsCascade, 'fetchBest').mockResolvedValue(null);
      // The backend never answers (a cold start): the request only ends when it is aborted.
      jest.spyOn(global, 'fetch').mockImplementation((_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }));
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const online = { type: 'plain' as const, result: { lyrics: 'Website words', source: 'Found online' } };
      mockFoundOnline.mockResolvedValue(online);

      const pending = lyricaService.fetchLyrics('Rasathi', 'Artist', false, 285, { language: 'tamil' });
      // 3 s head start + 6 s grace is far inside the backend's 45 s cold-start allowance.
      await jest.advanceTimersByTimeAsync(10_000);
      await expect(pending).resolves.toEqual(online.result);
    } finally {
      jest.useRealTimers();
    }
  });

  it('leaves the website alone for a caller that asks it itself', async () => {
    jest.spyOn(EchoLyricsCascade, 'fetchBest').mockResolvedValue(null);
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 404, text: async () => '' } as Response);

    await expect(lyricaService.fetchLyrics('Song', 'Artist', false, 180, { skipFoundOnline: true })).resolves.toBeNull();
    expect(mockFoundOnline).not.toHaveBeenCalled();
  });

  it('asks the website once when the backend answers late with nothing', async () => {
    jest.spyOn(EchoLyricsCascade, 'fetchBest').mockResolvedValue(null);
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 404, text: async () => '' } as Response);
    mockFoundOnline.mockResolvedValue(null);

    await expect(lyricaService.fetchLyrics('Song', 'Artist', false, 180)).resolves.toBeNull();
    expect(mockFoundOnline).toHaveBeenCalledTimes(1);
  });
});

describe('getLyricsFriendlyError', () => {
  it('returns network message for fetch failures', () => {
    expect(getLyricsFriendlyError(new Error('Failed to fetch')))
      .toBe('No internet connection. Check your network and try again.');
  });

  it('returns timeout message for timed out errors', () => {
    expect(getLyricsFriendlyError(new Error('Request timed out')))
      .toBe('Lyrics request timed out. Please check connection and try again.');
  });

  it('returns provider-down message for 500 errors', () => {
    expect(getLyricsFriendlyError(new Error('500 server error')))
      .toBe('Lyrics service is temporarily unavailable. Please retry in a moment.');
  });

  it('returns rate limit message for 429 errors', () => {
    expect(getLyricsFriendlyError(new Error('429 rate limit exceeded')))
      .toBe('Too many requests. Please wait a moment and try again.');
  });

  it('returns not found message for 404 errors', () => {
    expect(getLyricsFriendlyError(new Error('404 not found')))
      .toBe('No lyrics found for this song.');
  });

  it('returns unavailable message for unknown errors', () => {
    expect(getLyricsFriendlyError(new Error('Something weird happened')))
      .toBe('Lyrics service is temporarily unavailable. Please retry in a moment.');
  });

  it('handles non-Error values gracefully', () => {
    expect(getLyricsFriendlyError('string error'))
      .toBe('Lyrics service is temporarily unavailable. Please retry in a moment.');
    expect(getLyricsFriendlyError(null))
      .toBe('Lyrics service is temporarily unavailable. Please retry in a moment.');
    expect(getLyricsFriendlyError(undefined))
      .toBe('Lyrics service is temporarily unavailable. Please retry in a moment.');
  });
});
