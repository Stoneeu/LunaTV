/** @jest-environment node */
/* eslint-env jest */
import { searchFromApi } from '../downstream';
import { getCachedSearchPage } from '../search-cache';

jest.mock('../config', () => ({
  API_CONFIG: {
    search: { path: '?wd=', pagePath: '?wd={query}&pg={page}', headers: {} },
  },
  getConfig: async () => ({ SiteConfig: { SearchDownstreamMaxPage: 3 } }),
}));
jest.mock('../utils', () => ({ cleanHtmlTags: (text) => text }));

const originalFetch = global.fetch;
beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  global.fetch = originalFetch;
});

it('keeps cached pages unchanged through repeated and concurrent multi-page searches', async () => {
  const site = {
    key: 'repeat-cache',
    name: 'test source',
    api: 'https://test.invalid/api',
  };
  global.fetch = jest.fn(async (url) => {
    const page = Number(new URL(url).searchParams.get('pg') || '1');
    return {
      ok: true,
      json: async () => ({
        pagecount: 3,
        list: [
          {
            vod_id: String(page),
            vod_name: `Video ${page}`,
            vod_pic: '',
            vod_play_url: `Episode$https://test.invalid/${page}.m3u8`,
          },
        ],
      }),
    };
  });
  const first = await searchFromApi(site, 'repeat');
  expect(first.map((item) => item.id)).toEqual(['1', '2', '3']);
  expect(
    getCachedSearchPage(site.key, 'repeat', 1).data.map((item) => item.id)
  ).toEqual(['1']);
  for (let round = 0; round < 40; round++) {
    const batches = await Promise.all([
      searchFromApi(site, 'repeat'),
      searchFromApi(site, 'repeat'),
    ]);
    batches.forEach((rows) =>
      expect(rows.map((item) => item.id)).toEqual(['1', '2', '3'])
    );
  }
  expect(first.map((item) => item.id)).toEqual(['1', '2', '3']);
  expect(global.fetch).toHaveBeenCalledTimes(3);
});

it('times out a stalled response body without retaining the source search', async () => {
  const site = {
    key: 'stalled-body',
    name: 'test source',
    api: 'https://test.invalid/api',
  };
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: () =>
      new Promise(() => {
        /* Simulate a response body that never arrives. */
      }),
  }));
  let finished = false;
  const search = searchFromApi(site, 'stalled').then((rows) => {
    finished = true;
    return rows;
  });
  for (let i = 0; i < 12; i++) await Promise.resolve();
  jest.advanceTimersByTime(8001);
  for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(finished).toBe(true);
  expect(await search).toEqual([]);
  expect(global.fetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(getCachedSearchPage(site.key, 'stalled', 1).status).toBe('timeout');
});
