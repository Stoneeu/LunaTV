/** @jest-environment node */
/* eslint-env jest */
import { getConfig } from '../config';
import { fetchDoubanData } from '../douban';
jest.mock('../config', () => ({
  getConfig: jest.fn(async () => ({
    SiteConfig: { DoubanProxyType: 'direct' },
  })),
}));
const originalFetch = global.fetch;
beforeEach(() => {
  jest.useFakeTimers();
  global.fetch = jest.fn();
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
});

it('times out a stalled body even if the transport ignores cancellation', async () => {
  global.fetch.mockResolvedValue({
    ok: true,
    json: () =>
      new Promise(() => {
        /* simulate a stalled body */
      }),
  });
  const pending = expect(
    fetchDoubanData('https://example.invalid')
  ).rejects.toThrow('timeout');
  await Promise.resolve();
  await Promise.resolve();
  expect(jest.getTimerCount()).toBe(1);
  jest.advanceTimersByTime(10000);
  await pending;
  expect(global.fetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

it('uses the configured Douban CDN while preserving path and query', async () => {
  getConfig.mockResolvedValueOnce({
    SiteConfig: { DoubanProxyType: 'cmliussss-cdn-tencent' },
  });
  global.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ items: [] }),
  });
  await fetchDoubanData(
    'https://m.douban.com/rexxar/api/v2/tv/recommend?start=20'
  );
  expect(global.fetch.mock.calls[0][0]).toBe(
    'https://m.douban.cmliussss.net/rexxar/api/v2/tv/recommend?start=20'
  );
  expect(jest.getTimerCount()).toBe(0);
});
