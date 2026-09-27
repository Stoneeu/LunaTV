import { createHash } from 'crypto';
import { NextRequest } from 'next/server';

import { AdminConfig } from './admin.types';
import { getAuthInfoFromCookie } from './auth';
import {
  CatalogCategory,
  defaultCatalogCategories,
  parseCatalogCategories,
} from './catalog';
import { getConfig } from './config';
import { db } from './db';

export class CatalogError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function catalogAccess(
  request: NextRequest,
  admin = false
): Promise<AdminConfig> {
  const auth = getAuthInfoFromCookie(request);
  if (!auth) throw new CatalogError('請先登入', 401);
  const local =
    (process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage') === 'localstorage';
  if (local) {
    if (admin) throw new CatalogError('此儲存模式不支援後台分類管理', 400);
    return getConfig();
  }
  // Read current settings so category edits and account bans apply across workers.
  const config = (await db.getAdminConfig()) || (await getConfig());
  const user = config.UserConfig.Users.find(
    (entry) => entry.username === auth.username
  );
  if (!auth.username || !user || user.banned)
    throw new CatalogError('請重新登入', 401);
  if (admin && auth.username !== process.env.USERNAME && user.role !== 'admin')
    throw new CatalogError('權限不足', 403);
  return config;
}

export function managedCatalog(config: AdminConfig): CatalogCategory[] {
  return config.AppCatalog === undefined
    ? defaultCatalogCategories()
    : parseCatalogCategories(config.AppCatalog);
}

export function catalogRevision(config: AdminConfig): string {
  return createHash('sha256')
    .update(JSON.stringify([managedCatalog(config), config.CustomCategories]))
    .digest('hex');
}

export function publicCatalog(config: AdminConfig): CatalogCategory[] {
  const categories = managedCatalog(config)
    .filter((category) => !category.disabled)
    .map((category) => ({
      id: category.id,
      label: category.label,
      options: category.options
        .filter((option) => !option.disabled)
        .map(({ id, label, query }) => ({ id, label, query })),
    }))
    .filter((category) => category.options.length > 0);
  for (const kind of ['movie', 'tv'] as const) {
    const options = config.CustomCategories.filter(
      (entry) => !entry.disabled && entry.type === kind
    )
      .slice(0, 50)
      .map((entry) => ({
        id: createHash('sha256')
          .update(JSON.stringify([entry.type, entry.query]))
          .digest('hex')
          .slice(0, 24),
        label: entry.name || entry.query,
        query: { source: 'douban' as const, kind, tag: entry.query },
      }));
    if (options.length)
      categories.push({
        id: `legacy-${kind}`,
        label: kind === 'movie' ? '自訂電影' : '自訂影集',
        options,
      });
  }
  return categories;
}
