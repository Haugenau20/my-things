import { captureInputSchema, MAX_PHOTOS } from '../domain/item';
import type { Item } from '../domain/item';
import type { CaptureAttempt } from './capture';

// One upload and two waiting captures provide backpressure without persistent private data.
export const MAX_QUEUED_CAPTURES = 3;
export type PhoneCaptureEntry = {
  id: string;
  name: string;
  roomId: string | null;
  files: File[];
  photoIds: string[];
  status: 'queued' | 'uploading' | 'failed';
  progress: string;
  error?: unknown;
  attempt?: CaptureAttempt;
};

export class PhoneCaptureQueue {
  private entries: PhoneCaptureEntry[] = [];
  private running = false;
  private closed = false;
  private readonly worker: (entry: PhoneCaptureEntry) => Promise<Item>;
  private readonly changed: () => void;
  private readonly saved: (item: Item) => void | Promise<void>;
  constructor(
    worker: (entry: PhoneCaptureEntry) => Promise<Item>,
    changed: () => void,
    saved: (item: Item) => void | Promise<void>,
  ) {
    this.worker = worker;
    this.changed = changed;
    this.saved = saved;
  }
  snapshot(): Readonly<PhoneCaptureEntry>[] {
    return this.entries.map((entry) => ({ ...entry }));
  }
  enqueue(name: string, roomId: string | null, files: File[]): string {
    if (this.closed) throw new Error('Capture queue is closed.');
    if (this.entries.length >= MAX_QUEUED_CAPTURES)
      throw new Error('Capture queue is full. Finish or retry the pending captures first.');
    const input = captureInputSchema.parse({
      name,
      roomId,
      reviewStatus: 'needs_review',
      photos: [],
    });
    if (files.length > MAX_PHOTOS || files.some((file) => !(file instanceof File)))
      throw new Error('Choose at most two photo files. Your selection is retained.');
    const id = crypto.randomUUID();
    this.entries.push({
      id,
      name: input.name,
      roomId: input.roomId,
      files: [...files],
      photoIds: files.map(() => crypto.randomUUID()),
      status: 'queued',
      progress: 'Waiting to upload…',
    });
    this.changed();
    void this.pump();
    return id;
  }
  progress(id: string, text: string): void {
    if (this.closed) return;
    const entry = this.entries.find((value) => value.id === id);
    if (entry) {
      entry.progress = text;
      this.changed();
    }
  }
  retry(): void {
    if (this.closed || this.running) return;
    const entry = this.entries[0];
    if (entry?.status !== 'failed') return;
    entry.status = 'queued';
    delete entry.error;
    this.changed();
    void this.pump();
  }
  editFailed(): PhoneCaptureEntry {
    const entry = this.entries[0];
    if (!entry || entry.status !== 'failed' || entry.attempt)
      throw new Error(
        'An attempted save must be retried or explicitly discarded through recovery.',
      );
    this.entries.shift();
    this.changed();
    void this.pump();
    return entry;
  }
  discarded(id: string): void {
    const entry = this.entries[0];
    if (!entry || entry.id !== id || entry.status !== 'failed')
      throw new Error('Only the failed capture can be removed after confirmed cleanup.');
    this.release(entry);
    this.entries.shift();
    this.changed();
    void this.pump();
  }
  dispose(): void {
    this.closed = true;
    this.entries.forEach((entry) => this.release(entry));
    this.entries = [];
  }
  private release(entry: PhoneCaptureEntry): void {
    entry.files = [];
    entry.photoIds = [];
    delete entry.attempt;
  }
  private async pump(): Promise<void> {
    if (this.running || this.closed || this.entries[0]?.status !== 'queued') return;
    this.running = true;
    try {
      while (!this.closed && this.entries[0]?.status === 'queued') {
        const entry = this.entries[0];
        entry.status = 'uploading';
        this.changed();
        try {
          const item = await this.worker(entry);
          if (this.closed) return;
          await this.saved(item);
          if (this.closed) return;
          this.release(entry);
          this.entries.shift();
          this.changed();
        } catch (error) {
          if (this.closed) return;
          entry.status = 'failed';
          entry.error = error;
          this.changed();
          return;
        }
      }
    } finally {
      this.running = false;
      if (!this.closed && this.entries[0]?.status === 'queued') void this.pump();
    }
  }
}
