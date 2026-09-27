import { NextRequest, NextResponse } from 'next/server';

import {
  catalogAccess,
  CatalogError,
  catalogRevision,
  publicCatalog,
} from '@/lib/catalog.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const config = await catalogAccess(request);
    const revision = catalogRevision(config);
    const headers = {
      'Cache-Control': 'private, no-cache',
      Vary: 'Cookie',
      ETag: `"${revision}"`,
    };
    if (request.headers.get('if-none-match') === headers.ETag)
      return new NextResponse(null, { status: 304, headers });
    return NextResponse.json(
      { schemaVersion: 1, revision, categories: publicCatalog(config) },
      { headers }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof CatalogError
            ? error.message
            : '讀取分類失敗，請重試',
      },
      {
        status: error instanceof CatalogError ? error.status : 503,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}
