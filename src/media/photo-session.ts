import type { FirebaseStorage } from 'firebase/storage';
import { getDownloadURL, ref } from 'firebase/storage';
import type { PhotoFile } from '../domain/item';
import type { PreparedPhoto } from './processing';

type Entry = {
  references: number;
  size: number;
  result: Promise<string>;
  url?: string;
  local: boolean;
};
type Retained = { url: string; expires: number; local: boolean; size: number };
export type PhotoLease = { url: string; release: () => void };

/** How long an unmounted photo keeps its URL, so scrolling back or returning to a view is free. */
export const RETAIN_MS = 10 * 60 * 1000;
/** Retained URLs are short strings (or small local thumbnails); bound them by count. */
export const RETAIN_LIMIT = 500;
/** Seeded local thumbnails hold their bytes in memory; cap their combined size separately. */
export const LOCAL_RETAIN_BYTES = 16 * 1024 * 1024;
export const WORKING_SET_BYTES = 24 * 1024 * 1024;

/**
 * Issues owner-authorized photo URLs. Mounted images hold leases that count toward the working
 * set; released URLs stay in memory for a short retention window, then are dropped. One session
 * belongs to one authorized account and is disposed on sign-out.
 */
export class PhotoSession {
  private entries = new Map<string, Entry>();
  private retained = new Map<string, Retained>();
  private controller = new AbortController();
  private running = 0;
  private waiting: (() => void)[] = [];
  private bytes = 0;
  private localBytes = 0;
  private storage: FirebaseStorage;
  private now: () => number;
  constructor(storage: FirebaseStorage, options: { now?: () => number } = {}) {
    this.storage = storage;
    this.now = options.now ?? (() => Date.now());
  }

  private async resolveURL(file: PhotoFile): Promise<string> {
    if (this.running >= 2) await new Promise<void>((resolve) => this.waiting.push(resolve));
    else ++this.running;
    try {
      this.controller.signal.throwIfAborted();
      const url = await getDownloadURL(ref(this.storage, file.storagePath));
      this.controller.signal.throwIfAborted();
      return url;
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else --this.running;
    }
  }
  private drop(value: Retained) {
    if (!value.local) return;
    URL.revokeObjectURL(value.url);
    this.localBytes -= value.size;
  }
  private take(key: string): Retained | undefined {
    const value = this.retained.get(key);
    this.retained.delete(key);
    if (value?.local) this.localBytes -= value.size;
    return value;
  }
  private prune() {
    const now = this.now();
    // Every entry shares one lifetime, so insertion order is expiry order.
    for (const [key, value] of this.retained) {
      if (
        value.expires > now &&
        this.retained.size <= RETAIN_LIMIT &&
        this.localBytes <= LOCAL_RETAIN_BYTES
      )
        break;
      this.retained.delete(key);
      this.drop(value);
    }
  }
  private retain(key: string, url: string, local: boolean, size: number) {
    const previous = this.take(key);
    if (previous?.local && previous.url !== url) URL.revokeObjectURL(previous.url);
    this.retained.set(key, { url, local, size, expires: this.now() + RETAIN_MS });
    if (local) this.localBytes += size;
    this.prune();
  }
  async acquire(file: PhotoFile, signal: AbortSignal): Promise<PhotoLease> {
    signal.throwIfAborted();
    this.controller.signal.throwIfAborted();
    this.prune();
    const key = file.storagePath + ':' + file.sha256;
    let entry = this.entries.get(key);
    if (!entry) {
      if (this.bytes + file.byteSize > WORKING_SET_BYTES)
        throw new Error('Photo memory limit reached. Close other photos and retry.');
      this.bytes += file.byteSize;
      const kept = this.take(key);
      if (kept) {
        entry = {
          references: 0,
          size: file.byteSize,
          result: Promise.resolve(kept.url),
          url: kept.url,
          local: kept.local,
        };
      } else {
        const created: Entry = {
          references: 0,
          size: file.byteSize,
          result: this.resolveURL(file),
          local: false,
        };
        created.result.then(
          (url) => {
            created.url = url;
          },
          () => {},
        );
        entry = created;
      }
      this.entries.set(key, entry);
    }
    ++entry.references;
    const current = entry;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      if (--current.references === 0) {
        if (this.entries.get(key) === current) {
          this.entries.delete(key);
          this.bytes -= current.size;
          if (current.url && !this.controller.signal.aborted)
            this.retain(key, current.url, current.local, current.size);
        }
      }
    };
    try {
      const url = await current.result;
      signal.throwIfAborted();
      this.controller.signal.throwIfAborted();
      return { url, release };
    } catch (error) {
      release();
      throw error;
    }
  }
  /**
   * Registers the verified local bytes of a just-uploaded photo, so its first display needs no
   * Storage request. The temporary object URL is revoked on eviction or sign-out.
   */
  seed(file: PhotoFile, blob: Blob) {
    if (this.controller.signal.aborted) return;
    const key = file.storagePath + ':' + file.sha256;
    if (this.entries.has(key) || this.retained.has(key)) return;
    this.retain(key, URL.createObjectURL(blob), true, blob.size);
  }
  /** Seeds the gallery thumbnails of an acknowledged capture or attachment. */
  seedPrepared(prepared: readonly PreparedPhoto[]) {
    for (const entry of prepared) this.seed(entry.photo.thumbnail, entry.thumbnail);
  }
  dispose() {
    this.controller.abort();
    for (const wake of this.waiting.splice(0)) wake();
    // Dropping local references does not revoke a copied bearer URL at Firebase.
    for (const entry of this.entries.values())
      if (entry.local && entry.url) URL.revokeObjectURL(entry.url);
    for (const value of this.retained.values()) this.drop(value);
    this.entries.clear();
    this.retained.clear();
    this.bytes = 0;
    this.localBytes = 0;
  }
}
