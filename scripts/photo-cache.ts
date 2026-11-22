import { ID_PATTERN } from '../src/data/config.ts';
import { LEGACY_PHOTO_CACHE, PHOTO_CACHE } from '../src/media/cache-policy.ts';

/** The subset of a Cloud Storage object resource this migration reads. */
export type StoredObject = {
  name: string;
  metageneration: string;
  contentType?: string;
  cacheControl?: string;
};
export type ObjectPage = { items: StoredObject[]; nextPageToken?: string };
/** Cloud Storage JSON API operations, implemented for the cloud and for the local emulator. */
export type StorageTransport = {
  list(prefix: string, pageToken: string | undefined): Promise<ObjectPage>;
  /** Replaces only `cacheControl`; download tokens and other metadata are untouched. */
  patchCacheControl(name: string, metageneration: string, value: string): Promise<StoredObject>;
};
export type CacheMigrationReport = {
  inspected: number;
  current: number;
  pending: number;
  updated: number;
  /** Objects outside the photo namespace or with other metadata; never modified. */
  skipped: { name: string; reason: string }[];
  failed: { name: string; reason: string }[];
};

const MAX_OBJECTS = 100000;
const CONCURRENCY = 4;

function photoPattern(inventory: string) {
  return new RegExp(
    `^inventories/${inventory}/items/[A-Za-z0-9_-]{1,128}/photos/[A-Za-z0-9_-]{1,128}/(detail|thumb)\\.jpg$`,
  );
}
function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Moves existing photo objects from the legacy no-store Cache-Control value to the cacheable
 * one. Dry run unless `apply` is set. Each update is conditional on the listed metageneration,
 * so a concurrently changed object is reported instead of overwritten. Rerunning is safe.
 */
export async function migratePhotoCache(options: {
  transport: StorageTransport;
  inventory: string;
  apply: boolean;
  log?: (line: string) => void;
}): Promise<CacheMigrationReport> {
  const { transport, inventory, apply } = options;
  const log = options.log ?? (() => {});
  if (!ID_PATTERN.test(inventory)) throw new Error('Invalid inventory ID');
  const prefix = `inventories/${inventory}/items/`;
  const pattern = photoPattern(inventory);
  const report: CacheMigrationReport = {
    inspected: 0,
    current: 0,
    pending: 0,
    updated: 0,
    skipped: [],
    failed: [],
  };
  const candidates: StoredObject[] = [];
  const tokens = new Set<string>();
  let token: string | undefined;
  do {
    const page = await transport.list(prefix, token);
    for (const object of page.items) {
      if (++report.inspected > MAX_OBJECTS)
        throw new Error('Listing exceeds the migration safety limit; nothing was changed.');
      if (!pattern.test(object.name))
        report.skipped.push({ name: object.name, reason: 'outside the photo namespace' });
      else if (object.contentType !== 'image/jpeg')
        report.skipped.push({ name: object.name, reason: 'not image/jpeg' });
      else if (object.cacheControl === PHOTO_CACHE) ++report.current;
      else if (object.cacheControl === LEGACY_PHOTO_CACHE) candidates.push(object);
      else
        report.skipped.push({
          name: object.name,
          reason: `unexpected Cache-Control ${JSON.stringify(object.cacheControl ?? null)}`,
        });
    }
    token = page.nextPageToken || undefined;
    if (token) {
      if (tokens.has(token)) throw new Error('Repeated page token; nothing was changed.');
      tokens.add(token);
    }
  } while (token);
  report.pending = candidates.length;
  log(
    `Inspected ${report.inspected} objects: ${report.current} current, ${report.pending} legacy, ${report.skipped.length} skipped.`,
  );
  if (!apply) return report;
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, async () => {
      while (cursor < candidates.length) {
        const object = candidates[cursor++]!;
        try {
          const result = await transport.patchCacheControl(
            object.name,
            object.metageneration,
            PHOTO_CACHE,
          );
          if (result.cacheControl !== PHOTO_CACHE)
            throw new Error('Cloud Storage did not confirm the new Cache-Control value');
          ++report.updated;
          if (report.updated % 100 === 0) log(`Updated ${report.updated}/${report.pending}…`);
        } catch (error) {
          report.failed.push({ name: object.name, reason: describe(error) });
        }
      }
    }),
  );
  log(`Updated ${report.updated}/${report.pending}; ${report.failed.length} failed.`);
  return report;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;
function objectFrom(value: unknown): StoredObject {
  if (!value || typeof value !== 'object') throw new Error('Unexpected object resource');
  const record = value as Record<string, unknown>;
  if (typeof record.name !== 'string') throw new Error('Object resource has no name');
  return {
    name: record.name,
    metageneration: String(record.metageneration ?? ''),
    ...(typeof record.contentType === 'string' ? { contentType: record.contentType } : {}),
    ...(typeof record.cacheControl === 'string' ? { cacheControl: record.cacheControl } : {}),
  };
}

/** JSON API transport over fetch. `base` is the API root that contains `/b/{bucket}/o`. */
export function jsonApiTransport(options: {
  base: string;
  bucket: string;
  authorization: () => Promise<string>;
  fetch?: Fetch;
}): StorageTransport {
  const send = options.fetch ?? ((url, init) => fetch(url, init));
  const bucket = encodeURIComponent(options.bucket);
  async function call(path: string, init: RequestInit): Promise<unknown> {
    const response = await send(options.base + path, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        authorization: await options.authorization(),
      },
    });
    if (!response.ok)
      throw new Error(
        response.status === 412
          ? 'Object changed during migration; rerun to retry it'
          : `Cloud Storage returned HTTP ${response.status}`,
      );
    return response.json();
  }
  return {
    async list(prefix, pageToken) {
      const query = new URLSearchParams({ prefix, maxResults: '1000' });
      if (pageToken) query.set('pageToken', pageToken);
      const body = (await call(`/b/${bucket}/o?${query}`, { method: 'GET' })) as {
        items?: unknown[];
        nextPageToken?: string;
      };
      return {
        items: (body.items ?? []).map(objectFrom),
        ...(body.nextPageToken ? { nextPageToken: body.nextPageToken } : {}),
      };
    },
    async patchCacheControl(name, metageneration, value) {
      const query = new URLSearchParams({ ifMetagenerationMatch: metageneration });
      return objectFrom(
        await call(`/b/${bucket}/o/${encodeURIComponent(name)}?${query}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ cacheControl: value }),
        }),
      );
    },
  };
}
