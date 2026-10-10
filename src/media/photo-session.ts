import type { FirebaseStorage } from 'firebase/storage';
import type { PhotoFile } from '../domain/item';
import { verifiedBytes } from './files';

type Entry = { references: number; size: number; result: Promise<string> };
export type PhotoLease = { url: string; release: () => void };

/** Only mounted images retain URLs. One session belongs to one authorized account. */
export class PhotoSession {
  private entries = new Map<string, Entry>();
  private controller = new AbortController();
  private running = 0;
  private waiting: (() => void)[] = [];
  private bytes = 0;
  private storage: FirebaseStorage;
  constructor(storage: FirebaseStorage) {
    this.storage = storage;
  }

  private async download(file: PhotoFile): Promise<string> {
    if (this.running >= 2) await new Promise<void>((resolve) => this.waiting.push(resolve));
    else ++this.running;
    try {
      this.controller.signal.throwIfAborted();
      const bytes = await verifiedBytes(this.storage, file, this.controller.signal);
      this.controller.signal.throwIfAborted();
      return URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else --this.running;
    }
  }
  async acquire(file: PhotoFile, signal: AbortSignal): Promise<PhotoLease> {
    signal.throwIfAborted();
    this.controller.signal.throwIfAborted();
    const key = file.storagePath + ':' + file.sha256;
    let entry = this.entries.get(key);
    if (!entry) {
      if (this.bytes + file.byteSize > 24 * 1024 * 1024)
        throw new Error('Photo memory limit reached. Close other photos and retry.');
      this.bytes += file.byteSize;
      entry = { references: 0, size: file.byteSize, result: this.download(file) };
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
        }
        void current.result.then(
          (url) => URL.revokeObjectURL(url),
          () => undefined,
        );
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
  dispose() {
    this.controller.abort();
    for (const wake of this.waiting.splice(0)) wake();
    for (const entry of this.entries.values())
      void entry.result.then(
        (url) => URL.revokeObjectURL(url),
        () => undefined,
      );
    this.entries.clear();
    this.bytes = 0;
  }
}
