/** @jest-environment node */
/* eslint-env jest */
import { NextRequest } from 'next/server';

import { getAuthInfoFromCookie } from '../auth';
import { defaultCatalogCategories } from '../catalog';
import { catalogRevision } from '../catalog.server';
import { db } from '../db';
import { fetchDoubanData } from '../douban';
import { POST as saveCatalog } from '../../app/api/admin/catalog/route';
import { GET as getCatalog } from '../../app/api/catalog/route';
import { GET as recommend } from '../../app/api/douban/recommends/route';

jest.mock('next/server', () => {
  class NextRequest {
    constructor(url, options = {}) {
      this.url = url;
      this.body = options.body;
      this.headers = new Map(
        Object.entries(options.headers || {}).map(([k, v]) => [
          k.toLowerCase(),
          v,
        ])
      );
    }
    async text() {
      return this.body;
    }
  }
  class NextResponse {
    constructor(body, options = {}) {
      this.body = body;
      this.status = options.status || 200;
      this.headers = {
        get: (name) =>
          Object.entries(options.headers || {}).find(
            ([key]) => key.toLowerCase() === name.toLowerCase()
          )?.[1],
      };
    }
    async json() {
      return JSON.parse(this.body);
    }
    static json(body, options) {
      return new NextResponse(JSON.stringify(body), options);
    }
  }
  return { NextRequest, NextResponse };
});

jest.mock('../db', () => ({
  db: { getAdminConfig: jest.fn(), saveAdminConfig: jest.fn() },
}));
jest.mock('../config', () => ({
  getConfig: jest.fn(),
  getCacheTime: async () => 300,
  setCachedConfig: jest.fn(),
}));
jest.mock('../auth', () => ({ getAuthInfoFromCookie: jest.fn() }));
jest.mock('../douban', () => ({ fetchDoubanData: jest.fn() }));
let config;
const request = (path, body) =>
  new NextRequest(
    'http://localhost' + path,
    body ? { method: 'POST', body: JSON.stringify(body) } : undefined
  );
beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_STORAGE_TYPE = 'redis';
  config = {
    UserConfig: {
      Users: [
        { username: 'viewer', role: 'user' },
        { username: 'editor', role: 'admin' },
      ],
    },
    CustomCategories: [],
    AppCatalog: defaultCatalogCategories(),
    ConfigFile: 'private-data',
  };
  db.getAdminConfig.mockImplementation(async () => config);
  getAuthInfoFromCookie.mockReturnValue({ username: 'viewer' });
});

it('allows a regular user to read only the public contract and revalidate by ETag', async () => {
  const response = await getCatalog(request('/api/catalog'));
  const data = await response.json();
  expect(response.status).toBe(200);
  expect(Object.keys(data).sort()).toEqual([
    'categories',
    'revision',
    'schemaVersion',
  ]);
  expect(JSON.stringify(data)).not.toContain('private-data');
  const response2 = await getCatalog(
    new NextRequest('http://localhost/api/catalog', {
      headers: { 'If-None-Match': response.headers.get('ETag') },
    })
  );
  expect(response2.status).toBe(304);
});

it('rejects anonymous, removed and banned accounts and ordinary users cannot edit', async () => {
  getAuthInfoFromCookie.mockReturnValue(null);
  expect((await getCatalog(request('/api/catalog'))).status).toBe(401);
  getAuthInfoFromCookie.mockReturnValue({ username: 'removed' });
  expect((await getCatalog(request('/api/catalog'))).status).toBe(401);
  getAuthInfoFromCookie.mockReturnValue({ username: 'viewer' });
  expect(
    (await saveCatalog(request('/api/admin/catalog', { categories: [] })))
      .status
  ).toBe(403);
  config.UserConfig.Users[0].banned = true;
  expect((await getCatalog(request('/api/catalog'))).status).toBe(401);
});

it('does not publish unsaved settings on database failure, and rejects a stale revision', async () => {
  getAuthInfoFromCookie.mockReturnValue({ username: 'editor' });
  const revision = catalogRevision(config);
  db.saveAdminConfig.mockRejectedValueOnce(new Error('offline'));
  expect(
    (
      await saveCatalog(
        request('/api/admin/catalog', { revision, categories: [] })
      )
    ).status
  ).toBe(503);
  expect(config.AppCatalog).toHaveLength(6);
  expect(
    (
      await saveCatalog(
        request('/api/admin/catalog', { revision: 'stale', categories: [] })
      )
    ).status
  ).toBe(409);
  expect(
    (
      await saveCatalog(
        request('/api/admin/catalog', { revision, categories: [] })
      )
    ).status
  ).toBe(200);
  expect(db.saveAdminConfig.mock.calls[1][0].AppCatalog).toEqual([]);
});

it.each([
  'limit=0',
  'limit=101',
  'limit=NaN',
  'start=-1',
  'start=1.5',
  'kind=invalid',
])('rejects invalid paging before contacting upstream: %s', async (params) => {
  const response = await recommend(
    request(
      '/api/douban/recommends?' +
        (params.startsWith('kind=') ? '' : 'kind=tv&') +
        params
    )
  );
  expect(response.status).toBe(400);
  expect(fetchDoubanData).not.toHaveBeenCalled();
});

it('advances the raw cursor over filtered items, including a fully filtered page', async () => {
  fetchDoubanData.mockResolvedValue({
    items: [
      { type: 'ad' },
      { type: 'tv', id: '1', title: 'example', pic: {}, year: '2025' },
    ],
  });
  const first = await (
    await recommend(
      request(
        '/api/douban/recommends?kind=tv&start=20&platform=Netflix&category=动画&region=日本'
      )
    )
  ).json();
  expect(first).toMatchObject({ nextStart: 22, hasMore: true });
  expect(first.list).toHaveLength(1);
  const url = new URL(fetchDoubanData.mock.calls[0][0]);
  expect(url.searchParams.get('tags')).toBe('动画,日本,Netflix');
  fetchDoubanData.mockResolvedValue({ items: [{ type: 'ad' }] });
  expect(
    await (
      await recommend(request('/api/douban/recommends?kind=tv&start=22'))
    ).json()
  ).toMatchObject({ list: [], nextStart: 23, hasMore: true });
  fetchDoubanData.mockResolvedValue({ items: [] });
  expect(
    await (
      await recommend(request('/api/douban/recommends?kind=tv&start=23'))
    ).json()
  ).toMatchObject({ nextStart: 23, hasMore: false });
});
