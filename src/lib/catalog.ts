/** Versioned, data-only contract shared by the admin editor and App endpoint. */
export type CatalogQuery = {
  source: 'douban' | 'douban-recommends';
  kind: 'movie' | 'tv';
  tag?: string;
  category?: string;
  format?: string;
  region?: string;
  year?: string;
  platform?: string;
  label?: string;
  sort?: 'T' | 'U' | 'R' | 'S';
};

export interface CatalogOption {
  id: string;
  label: string;
  query: CatalogQuery;
  disabled?: boolean;
}

export interface CatalogCategory {
  id: string;
  label: string;
  options: CatalogOption[];
  disabled?: boolean;
}

export const FILTER_FIELDS = [
  'category',
  'format',
  'region',
  'year',
  'platform',
  'label',
] as const;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max = 100): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const id = (value: unknown): value is string =>
  text(value, 80) && /^[a-zA-Z0-9_-]+$/.test(value);

export function parseCatalogQuery(value: unknown): CatalogQuery {
  if (!object(value) || !['movie', 'tv'].includes(String(value.kind)))
    throw new Error('影片類型不正確');
  const kind = value.kind as CatalogQuery['kind'];
  if (value.source === 'douban') {
    if (!text(value.tag)) throw new Error('請輸入有效的查詢標籤');
    return { source: 'douban', kind, tag: value.tag };
  }
  if (value.source !== 'douban-recommends') throw new Error('不支援的分類來源');
  const query: CatalogQuery = { source: value.source, kind };
  for (const field of FILTER_FIELDS) {
    if (value[field] !== undefined && value[field] !== '') {
      if (!text(value[field])) throw new Error('篩選條件格式不正確');
      query[field] = value[field] as string;
    }
  }
  if (value.sort !== undefined) {
    if (!['T', 'U', 'R', 'S'].includes(String(value.sort)))
      throw new Error('排序條件不正確');
    query.sort = value.sort as CatalogQuery['sort'];
  }
  return query;
}

export function parseCatalogCategories(value: unknown): CatalogCategory[] {
  if (!Array.isArray(value) || value.length > 40)
    throw new Error('分類數量不可超過 40 個');
  const ids = new Set<string>();
  let optionCount = 0;
  return value.map((entry) => {
    if (
      !object(entry) ||
      !id(entry.id) ||
      entry.id.startsWith('legacy-') ||
      !text(entry.label) ||
      ids.has(entry.id)
    ) {
      throw new Error('分類名稱或識別碼不正確、重複');
    }
    ids.add(entry.id);
    if (entry.disabled !== undefined && typeof entry.disabled !== 'boolean')
      throw new Error('啟用狀態不正確');
    if (
      !Array.isArray(entry.options) ||
      !entry.options.length ||
      entry.options.length > 50
    )
      throw new Error('每個分類需有 1 至 50 個子分類');
    const optionIds = new Set<string>();
    const options = entry.options.map((option): CatalogOption => {
      if (++optionCount > 200) throw new Error('子分類總數不可超過 200 個');
      if (
        !object(option) ||
        !id(option.id) ||
        !text(option.label) ||
        optionIds.has(option.id)
      )
        throw new Error('子分類名稱或識別碼不正確、重複');
      if (option.disabled !== undefined && typeof option.disabled !== 'boolean')
        throw new Error('啟用狀態不正確');
      optionIds.add(option.id);
      return {
        id: option.id,
        label: option.label,
        disabled: option.disabled === true,
        query: parseCatalogQuery(option.query),
      };
    });
    return {
      id: entry.id,
      label: entry.label,
      disabled: entry.disabled === true,
      options,
    };
  });
}

export function defaultCatalogCategories(): CatalogCategory[] {
  const tagged = (
    categoryId: string,
    label: string,
    kind: 'movie' | 'tv',
    tags: string[]
  ): CatalogCategory => ({
    id: categoryId,
    label,
    options: tags.map((tag) => ({
      id: `${categoryId}-${Array.from(tag)
        .map((char) => char.codePointAt(0)?.toString(16))
        .join('-')}`,
      label: tag,
      query: { source: 'douban', kind, tag },
    })),
  });
  return [
    tagged('popular', '熱門影集', 'tv', ['热门']),
    tagged('tv', '電視劇', 'tv', [
      '国产剧',
      '美剧',
      '英剧',
      '韩剧',
      '日剧',
      '港剧',
      '日本动画',
      '动画',
    ]),
    tagged('movie', '電影', 'movie', [
      '热门',
      '最新',
      '经典',
      '豆瓣高分',
      '冷门佳片',
      '华语',
      '欧美',
      '韩国',
      '日本',
      '动作',
      '喜剧',
      '爱情',
      '科幻',
      '悬疑',
      '恐怖',
    ]),
    {
      id: 'netflix',
      label: 'Netflix',
      options: [
        {
          id: 'series',
          label: '影集',
          query: {
            source: 'douban-recommends',
            kind: 'tv',
            format: '电视剧',
            platform: 'Netflix',
          },
        },
        {
          id: 'movies',
          label: '電影',
          query: {
            source: 'douban-recommends',
            kind: 'movie',
            platform: 'Netflix',
          },
        },
        {
          id: 'jp-anime',
          label: '日本動畫',
          query: {
            source: 'douban-recommends',
            kind: 'tv',
            category: '动画',
            format: '电视剧',
            region: '日本',
            platform: 'Netflix',
          },
        },
        {
          id: 'shows',
          label: '綜藝',
          query: {
            source: 'douban-recommends',
            kind: 'tv',
            format: '综艺',
            platform: 'Netflix',
          },
        },
      ],
    },
    tagged('shows', '綜藝', 'tv', ['综艺']),
    tagged('top250', '豆瓣 Top250', 'movie', ['top250']),
  ];
}
