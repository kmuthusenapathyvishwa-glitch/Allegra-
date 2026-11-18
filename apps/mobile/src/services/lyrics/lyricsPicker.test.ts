const mockFoundOnline = jest.fn();
jest.mock('./foundOnlineLyricsApi', () => ({
  fetchFoundOnlineLyrics: (...args: unknown[]) => mockFoundOnline(...args),
}));
jest.mock('./providers', () => ({
  DEFAULT_PROVIDER_ORDER: [],
  LYRICS_PROVIDERS: {},
  allegraVersions: jest.fn().mockResolvedValue([]),
}));
const mockBackend = jest.fn();
jest.mock('../LyricaService', () => ({
  lyricaService: { fetchLyrics: (...args: unknown[]) => mockBackend(...args), fromProvider: jest.fn() },
}));
jest.mock('../../store/playerStore', () => ({ usePlayerStore: { getState: jest.fn() } }));

import { searchEveryProvider } from './lyricsPicker';

const target = { title: 'Raasaadhi Raasan', artist: 'Sushin Shyam', duration: 157, album: 'Scene', language: 'tamil', ref: 'saavn:aeQKHFLx' };
const words = { type: 'plain' as const, result: { lyrics: 'Rasaadhi raasanukku\nAadanum thaan pol irukku', source: 'Found online' } };

afterEach(() => {
  mockFoundOnline.mockReset();
  mockBackend.mockReset();
});

describe('lyrics picker', () => {
  it('lists the website lyrics without waiting for a sleeping backend', async () => {
    mockFoundOnline.mockResolvedValue(words);
    mockBackend.mockReturnValue(new Promise(() => undefined));
    const heard: string[] = [];
    searchEveryProvider(target, option => heard.push(option.provider)).catch(() => undefined);
    await new Promise(resolve => setImmediate(resolve));
    expect(heard).toEqual(['Found online']);
    expect(mockFoundOnline).toHaveBeenCalledWith(expect.objectContaining({ title: 'Raasaadhi Raasan', album: 'Scene', language: 'tamil' }));
  });

  it('does not let the backend ask the website a second time', async () => {
    mockFoundOnline.mockResolvedValue(words);
    mockBackend.mockResolvedValue(null);
    await searchEveryProvider(target, () => undefined);
    expect(mockFoundOnline).toHaveBeenCalledTimes(1);
    expect(mockBackend).toHaveBeenCalledWith('Raasaadhi Raasan', 'Sushin Shyam', false, 157, expect.objectContaining({ skipFoundOnline: true }));
  });
});
