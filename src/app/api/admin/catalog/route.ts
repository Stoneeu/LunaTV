import { NextRequest, NextResponse } from 'next/server';

import { parseCatalogCategories } from '@/lib/catalog';
import {
  catalogAccess,
  CatalogError,
  catalogRevision,
  managedCatalog,
} from '@/lib/catalog.server';
import { setCachedConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
const failure = (error: unknown) =>
  NextResponse.json(
    {
      error:
        error instanceof CatalogError ? error.message : '分類儲存失敗，請重試',
    },
    { status: error instanceof CatalogError ? error.status : 503, headers }
  );

export async function GET(request: NextRequest) {
  try {
    const config = await catalogAccess(request, true);
    return NextResponse.json(
      { revision: catalogRevision(config), categories: managedCatalog(config) },
      { headers }
    );
  } catch (error) {
    return failure(error);
  }
}

// Serialize writes within this worker; revision checks also catch stale editors.
let writeQueue: Promise<unknown> = Promise.resolve();
export async function POST(request: NextRequest) {
  const write = async () => {
    try {
      const config = await catalogAccess(request, true);
      const raw = await request.text();
      if (raw.length > 128_000) throw new CatalogError('分類設定過大', 413);
      let body, categories;
      try {
        body = JSON.parse(raw);
        categories = parseCatalogCategories(body.categories);
      } catch (error) {
        throw new CatalogError(
          error instanceof Error ? error.message : '分類格式不正確',
          400
        );
      }
      if (body.revision !== catalogRevision(config))
        throw new CatalogError('分類已被更新，請重新載入後再儲存', 409);
      const updated = { ...config, AppCatalog: categories };
      await db.saveAdminConfig(updated);
      await setCachedConfig(updated);
      return NextResponse.json(
        { ok: true, revision: catalogRevision(updated), categories },
        { headers }
      );
    } catch (error) {
      return failure(error);
    }
  };
  const pending = writeQueue.then(write, write);
  writeQueue = pending;
  return pending;
}
