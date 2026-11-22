/**
 * Cache-Control metadata for photo objects. Objects are immutable (a replacement needs a new
 * photo ID) and their token URLs are stable, so browsers may keep them; `private` still forbids
 * shared/CDN caches. Kept free of SDK imports so the migration script can share it.
 */
export const PHOTO_CACHE = 'private, max-age=31536000, immutable';
/** Uploads before 2026-11-22 used this value until the cache migration script updates them. */
export const LEGACY_PHOTO_CACHE = 'private, no-store, max-age=0';
