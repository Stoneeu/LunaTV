/** @jest-environment node */
/* eslint-env jest */
import { getAuthInfoFromCookie } from '../auth';
import { getAvailableApiSites, getCacheTime, getConfig } from '../config';
import { searchFromApi } from '../downstream';
import { GET } from '../../app/api/search/route';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body, options = {}) => ({
      status: options.status || 200,
      json: async () => body,
    }),
  },
}));
jest.mock('../auth', () => ({ getAuthInfoFromCookie: jest.fn() }));
jest.mock('../config', () => ({
  getAvailableApiSites: jest.fn(),
  getCacheTime: jest.fn(),
  getConfig: jest.fn(),
}));
jest.mock('../downstream', () => ({ searchFromApi: jest.fn() }));
const row = {
  id: '1',
  source: 'test',
  title: 'Test video',
  poster: '',
  source_name: 'Test',
  year: '2026',
  episodes: ['https://test.invalid/episode.m3u8'],
  episodes_titles: ['Episode'],
  desc: 'full description',
};
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  getAuthInfoFromCookie.mockReturnValue({ username: 'viewer' });
  getAvailableApiSites.mockResolvedValue([{ key: 'test', name: 'Test' }]);
  getConfig.mockResolvedValue({ SiteConfig: { DisableYellowFilter: true } });
  getCacheTime.mockResolvedValue(300);
  searchFromApi.mockResolvedValue([row]);
});
afterEach(() => {
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

it('returns only grid fields when requested without changing the cached source object', async () => {
  const result = await (
    await GET({ url: 'http://localhost/api/search?q=test&view=cards' })
  ).json();
  expect(result.results).toEqual([
    {
      id: '1',
      source: 'test',
      title: 'Test video',
      poster: '',
      source_name: 'Test',
      year: '2026',
    },
  ]);
  expect(row.episodes).toHaveLength(1);
  expect(row.desc).toBe('full description');
});

it('preserves complete results for existing clients and detail searches', async () => {
  const result = await (
    await GET({ url: 'http://localhost/api/search?q=test' })
  ).json();
  expect(result.results).toEqual([row]);
});

it('checks login before a compact search starts', async () => {
  getAuthInfoFromCookie.mockReturnValue(null);
  expect(
    (await GET({ url: 'http://localhost/api/search?q=test&view=cards' })).status
  ).toBe(401);
  expect(searchFromApi).not.toHaveBeenCalled();
});
