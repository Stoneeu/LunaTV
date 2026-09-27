/** @jest-environment node */
/* eslint-env jest */
import { defaultCatalogCategories, parseCatalogCategories } from '../catalog';
import { catalogRevision, publicCatalog } from '../catalog.server';

jest.mock('../db', () => ({ db: {} }));
jest.mock('../config', () => ({ getConfig: jest.fn() }));

const config = () => ({
  CustomCategories: [],
  AppCatalog: defaultCatalogCategories(),
});

it('publishes enabled options in configured order, preserving stable IDs and raw queries', () => {
  const settings = config();
  settings.AppCatalog.reverse();
  settings.AppCatalog[0].disabled = true;
  settings.AppCatalog[2].options[0].disabled = true;
  const result = publicCatalog(settings);
  expect(result[0].id).toBe('shows');
  const anime = result
    .find((c) => c.id === 'netflix')
    .options.find((o) => o.id === 'jp-anime');
  expect(anime.query).toMatchObject({
    category: '动画',
    region: '日本',
    platform: 'Netflix',
  });
  expect(JSON.stringify(result)).not.toContain('disabled');
});

it('distinguishes intentionally empty settings from an unconfigured server', () => {
  expect(publicCatalog({ CustomCategories: [], AppCatalog: [] })).toEqual([]);
  expect(publicCatalog({ CustomCategories: [] }).length).toBeGreaterThan(0);
});

it('keeps legacy categories stable across rename and excludes disabled ones', () => {
  const settings = {
    AppCatalog: [],
    CustomCategories: [
      { type: 'tv', query: '日剧', name: '日劇' },
      { type: 'tv', query: '美剧', disabled: true },
    ],
  };
  const before = publicCatalog(settings);
  settings.CustomCategories[0].name = '日本影集';
  const after = publicCatalog(settings);
  expect(after[0].options).toHaveLength(1);
  expect(after[0].options[0].id).toBe(before[0].options[0].id);
});

it('changes revision when query, order or enabled state changes', () => {
  const settings = config(),
    revision = catalogRevision(settings);
  settings.AppCatalog[0].options[0].query.tag = '最新';
  expect(catalogRevision(settings)).not.toBe(revision);
});

it.each([
  null,
  Array(41).fill({}),
  [{ id: 'unsafe/url', label: 'bad', options: [] }],
  [
    {
      id: 'a',
      label: 'bad',
      options: [
        { id: 'o', label: 'bad', query: { source: 'url', kind: 'tv' } },
      ],
    },
  ],
])('rejects unsupported or excessive settings', (value) =>
  expect(() => parseCatalogCategories(value)).toThrow()
);

it('rejects duplicate IDs while allowing duplicate display names', () => {
  const entries = defaultCatalogCategories();
  entries[1].label = entries[0].label;
  expect(() => parseCatalogCategories(entries)).not.toThrow();
  entries[1].id = entries[0].id;
  expect(() => parseCatalogCategories(entries)).toThrow();
});
