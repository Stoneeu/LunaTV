'use client';

import { useEffect, useState } from 'react';

import {
  CatalogCategory,
  CatalogOption,
  CatalogQuery,
  defaultCatalogCategories,
  FILTER_FIELDS,
} from '@/lib/catalog';

const fieldLabels = {
  category: '類型',
  format: '形式',
  region: '地區',
  year: '年份',
  platform: '平台',
  label: '標籤',
};
const inputStyle = 'rounded border p-2 text-sm bg-white dark:bg-gray-800';
const buttonStyle = 'rounded border px-3 py-2 text-sm disabled:opacity-40';
const newId = () => `c-${crypto.randomUUID()}`;

export default function AppCatalogConfig() {
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [revision, setRevision] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  const load = async (signal?: AbortSignal) => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/catalog', { signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '讀取失敗');
      setCategories(data.categories);
      setRevision(data.revision);
      setDirty(false);
    } catch (error) {
      if (!signal?.aborted)
        setError(error instanceof Error ? error.message : '讀取失敗');
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  const change = (next: CatalogCategory[]) => {
    setCategories(next);
    setDirty(true);
    setMessage('');
  };
  const editCategory = (index: number, update: Partial<CatalogCategory>) =>
    change(
      categories.map((category, i) =>
        i === index ? { ...category, ...update } : category
      )
    );
  const editOption = (
    index: number,
    optionIndex: number,
    update: Partial<CatalogOption>
  ) =>
    editCategory(index, {
      options: categories[index].options.map((option, i) =>
        i === optionIndex ? { ...option, ...update } : option
      ),
    });
  const move = <T,>(items: T[], index: number, delta: number) => {
    const next = [...items];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    return next;
  };
  const save = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision, categories }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '儲存失敗');
      setRevision(data.revision);
      setCategories(data.categories);
      setDirty(false);
      setMessage('已儲存。App 返回首頁或按「更新分類」即可同步。');
    } catch (error) {
      setError(error instanceof Error ? error.message : '儲存失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='space-y-4'>
      <p className='text-sm'>
        設定 Android App
        的分類與子分類。最近播放固定保留；原有自訂分類會另外同步。Netflix
        是豆瓣平台標籤，地區代表作品產地。
      </p>
      {error && (
        <p role='alert' className='text-red-600'>
          {error}
        </p>
      )}
      {message && (
        <p role='status' className='text-green-600'>
          {message}
        </p>
      )}
      <fieldset disabled={busy || !revision} className='space-y-4'>
        {categories.map((category, index) => (
          <div key={category.id} className='rounded border p-4 space-y-3'>
            <div className='flex flex-wrap items-center gap-2'>
              <input
                aria-label='分類名稱'
                className={inputStyle}
                maxLength={100}
                value={category.label}
                onChange={(event) =>
                  editCategory(index, { label: event.target.value })
                }
              />
              <label>
                <input
                  type='checkbox'
                  checked={!category.disabled}
                  onChange={(event) =>
                    editCategory(index, { disabled: !event.target.checked })
                  }
                />{' '}
                啟用
              </label>
              <button
                className={buttonStyle}
                disabled={index === 0}
                onClick={() => change(move(categories, index, -1))}
              >
                上移分類
              </button>
              <button
                className={buttonStyle}
                disabled={index === categories.length - 1}
                onClick={() => change(move(categories, index, 1))}
              >
                下移分類
              </button>
              <button
                className={buttonStyle}
                onClick={() => change(categories.filter((_, i) => i !== index))}
              >
                移除分類
              </button>
            </div>
            {category.options.map((option, optionIndex) => (
              <div
                key={option.id}
                className='rounded bg-gray-50 dark:bg-gray-900 p-3 space-y-2'
              >
                <div className='flex flex-wrap gap-2 items-center'>
                  <input
                    aria-label='子分類名稱'
                    className={inputStyle}
                    maxLength={100}
                    value={option.label}
                    onChange={(event) =>
                      editOption(index, optionIndex, {
                        label: event.target.value,
                      })
                    }
                  />
                  <label>
                    <input
                      type='checkbox'
                      checked={!option.disabled}
                      onChange={(event) =>
                        editOption(index, optionIndex, {
                          disabled: !event.target.checked,
                        })
                      }
                    />{' '}
                    啟用
                  </label>
                  <select
                    aria-label='影片種類'
                    className={inputStyle}
                    value={option.query.kind}
                    onChange={(event) =>
                      editOption(index, optionIndex, {
                        query: {
                          ...option.query,
                          kind: event.target.value as 'movie' | 'tv',
                        },
                      })
                    }
                  >
                    <option value='tv'>影集／動畫／綜藝</option>
                    <option value='movie'>電影</option>
                  </select>
                  <select
                    aria-label='查詢方式'
                    className={inputStyle}
                    value={option.query.source}
                    onChange={(event) =>
                      editOption(index, optionIndex, {
                        query:
                          event.target.value === 'douban'
                            ? {
                                source: 'douban',
                                kind: option.query.kind,
                                tag: '热门',
                              }
                            : {
                                source: 'douban-recommends',
                                kind: option.query.kind,
                              },
                      })
                    }
                  >
                    <option value='douban'>單一標籤</option>
                    <option value='douban-recommends'>組合篩選</option>
                  </select>
                  <button
                    className={buttonStyle}
                    disabled={optionIndex === 0}
                    onClick={() =>
                      editCategory(index, {
                        options: move(category.options, optionIndex, -1),
                      })
                    }
                  >
                    上移
                  </button>
                  <button
                    className={buttonStyle}
                    disabled={optionIndex === category.options.length - 1}
                    onClick={() =>
                      editCategory(index, {
                        options: move(category.options, optionIndex, 1),
                      })
                    }
                  >
                    下移
                  </button>
                  <button
                    className={buttonStyle}
                    onClick={() =>
                      editCategory(index, {
                        options: category.options.filter(
                          (_, i) => i !== optionIndex
                        ),
                      })
                    }
                  >
                    移除
                  </button>
                </div>
                {option.query.source === 'douban' ? (
                  <label className='flex gap-2 items-center'>
                    查詢標籤
                    <input
                      className={inputStyle}
                      maxLength={100}
                      value={option.query.tag || ''}
                      onChange={(event) =>
                        editOption(index, optionIndex, {
                          query: { ...option.query, tag: event.target.value },
                        })
                      }
                    />
                  </label>
                ) : (
                  <div className='flex flex-wrap gap-3'>
                    {FILTER_FIELDS.map((field) => (
                      <label
                        key={field}
                        className='flex flex-col gap-1 text-sm'
                      >
                        {fieldLabels[field]}
                        <input
                          className={inputStyle}
                          maxLength={100}
                          placeholder={
                            field === 'platform'
                              ? '例如 Netflix、HBO'
                              : field === 'category'
                              ? '例如 动画、喜剧'
                              : field === 'format'
                              ? '例如 电视剧、综艺'
                              : '全部（不限制）'
                          }
                          value={option.query[field] || ''}
                          onChange={(event) =>
                            editOption(index, optionIndex, {
                              query: {
                                ...option.query,
                                [field]: event.target.value,
                              },
                            })
                          }
                        />
                      </label>
                    ))}
                    <label className='flex flex-col gap-1 text-sm'>
                      排序
                      <select
                        className={inputStyle}
                        value={option.query.sort || 'T'}
                        onChange={(event) =>
                          editOption(index, optionIndex, {
                            query: {
                              ...option.query,
                              sort: event.target.value as CatalogQuery['sort'],
                            },
                          })
                        }
                      >
                        <option value='T'>綜合</option>
                        <option value='U'>近期熱度</option>
                        <option value='R'>首播時間</option>
                        <option value='S'>評分</option>
                      </select>
                    </label>
                  </div>
                )}
              </div>
            ))}
            <button
              className={buttonStyle}
              onClick={() =>
                editCategory(index, {
                  options: [
                    ...category.options,
                    {
                      id: newId(),
                      label: '新子分類',
                      query: { source: 'douban', kind: 'tv', tag: '热门' },
                    },
                  ],
                })
              }
            >
              新增子分類
            </button>
          </div>
        ))}
        <div className='flex flex-wrap gap-2'>
          <button
            className={buttonStyle}
            onClick={() =>
              change([
                ...categories,
                {
                  id: newId(),
                  label: '新分類',
                  options: [
                    {
                      id: newId(),
                      label: '全部',
                      query: { source: 'douban-recommends', kind: 'tv' },
                    },
                  ],
                },
              ])
            }
          >
            新增分類
          </button>
          <button
            className={buttonStyle}
            onClick={() => change(defaultCatalogCategories())}
          >
            載入預設分類
          </button>
          <button className={buttonStyle} disabled={!dirty} onClick={save}>
            儲存分類
          </button>
        </div>
      </fieldset>
      <button
        className={buttonStyle}
        disabled={busy}
        onClick={() => void load()}
      >
        重新載入設定
      </button>
      {dirty && <p className='text-sm'>尚有未儲存的變更。</p>}
    </div>
  );
}
