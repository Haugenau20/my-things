export type ListenerChange<T> =
  { type: 'added' | 'modified'; id: string; value: T } | { type: 'removed'; id: string };

/**
 * Merges a live listener with records this client has already confirmed from the server.
 *
 * Saves read their acknowledged record back before reporting success. Applying that record
 * immediately keeps revision checks and the UI current without re-reading the whole collection;
 * the listener catches up moments later and then becomes the only source again. A confirmed
 * record never yields to an older listener version, and a confirmed removal hides the record
 * until the listener reports the removal as well.
 */
export class LiveCollection<T extends { id: string }> {
  private server = new Map<string, T>();
  private confirmed = new Map<string, T | null>();
  private version: (value: T) => number;
  constructor(version: (value: T) => number) {
    this.version = version;
  }

  applyListener(changes: ListenerChange<T>[]): void {
    for (const change of changes) {
      const overlay = this.confirmed.get(change.id);
      if (change.type === 'removed') {
        this.server.delete(change.id);
        if (overlay === null) this.confirmed.delete(change.id);
        continue;
      }
      const existed = this.server.has(change.id);
      this.server.set(change.id, change.value);
      if (overlay === null) {
        // A record the listener had already dropped is new again, e.g. a restore recreated it.
        if (!existed) this.confirmed.delete(change.id);
      } else if (overlay && this.version(change.value) >= this.version(overlay))
        this.confirmed.delete(change.id);
    }
  }

  accept(value: T): void {
    const server = this.server.get(value.id);
    if (server && this.version(server) >= this.version(value)) this.confirmed.delete(value.id);
    else this.confirmed.set(value.id, value);
  }

  acceptRemoval(id: string): void {
    if (this.server.has(id)) this.confirmed.set(id, null);
    else this.confirmed.delete(id);
  }

  reset(): void {
    this.server.clear();
    this.confirmed.clear();
  }

  values(): T[] {
    const result: T[] = [];
    for (const [id, value] of this.server) {
      const overlay = this.confirmed.get(id);
      if (overlay === null) continue;
      result.push(overlay ?? value);
    }
    for (const [id, overlay] of this.confirmed)
      if (overlay && !this.server.has(id)) result.push(overlay);
    return result;
  }
}
