import { describe, expect, it } from 'vitest';
import { LiveCollection } from '../../src/domain/live-collection';

type Record = { id: string; revision: number; label: string };
const record = (id: string, revision: number, label = `${id}@${revision}`): Record => ({
  id,
  revision,
  label,
});
const collection = () => new LiveCollection<Record>((value) => value.revision);
const labels = (value: LiveCollection<Record>) =>
  value
    .values()
    .map((entry) => entry.label)
    .sort();

describe('live collection merging', () => {
  it('reflects listener additions, modifications and removals', () => {
    const live = collection();
    live.applyListener([
      { type: 'added', id: 'a', value: record('a', 1) },
      { type: 'added', id: 'b', value: record('b', 1) },
    ]);
    live.applyListener([
      { type: 'modified', id: 'a', value: record('a', 2) },
      { type: 'removed', id: 'b' },
    ]);
    expect(labels(live)).toEqual(['a@2']);
  });

  it('shows a confirmed save until the listener reaches the same revision', () => {
    const live = collection();
    live.applyListener([{ type: 'added', id: 'a', value: record('a', 1) }]);
    live.accept(record('a', 2, 'confirmed'));
    expect(labels(live)).toEqual(['confirmed']);
    // A late listener event from before the save must not revert the confirmed record.
    live.applyListener([{ type: 'modified', id: 'a', value: record('a', 1, 'stale') }]);
    expect(labels(live)).toEqual(['confirmed']);
    live.applyListener([{ type: 'modified', id: 'a', value: record('a', 2, 'server') }]);
    expect(labels(live)).toEqual(['server']);
    // Once caught up, the listener alone is authoritative again.
    live.applyListener([{ type: 'modified', id: 'a', value: record('a', 3, 'elsewhere') }]);
    expect(labels(live)).toEqual(['elsewhere']);
  });

  it('ignores a confirmed record older than the listener', () => {
    const live = collection();
    live.applyListener([{ type: 'added', id: 'a', value: record('a', 4) }]);
    live.accept(record('a', 3, 'older'));
    expect(labels(live)).toEqual(['a@4']);
  });

  it('shows a confirmed new record before the listener delivers it', () => {
    const live = collection();
    live.accept(record('new', 1, 'captured'));
    expect(labels(live)).toEqual(['captured']);
    live.applyListener([{ type: 'added', id: 'new', value: record('new', 1, 'listener') }]);
    expect(labels(live)).toEqual(['listener']);
  });

  it('hides a confirmed removal until the listener removes it', () => {
    const live = collection();
    live.applyListener([{ type: 'added', id: 'a', value: record('a', 1) }]);
    live.acceptRemoval('a');
    expect(labels(live)).toEqual([]);
    live.applyListener([{ type: 'modified', id: 'a', value: record('a', 2) }]);
    expect(labels(live)).toEqual([]);
    live.applyListener([{ type: 'removed', id: 'a' }]);
    expect(labels(live)).toEqual([]);
    // A later recreation (for example by restore) is shown normally.
    live.applyListener([{ type: 'added', id: 'a', value: record('a', 1, 'restored') }]);
    expect(labels(live)).toEqual(['restored']);
  });

  it('drops a removal the listener already reported', () => {
    const live = collection();
    live.applyListener([
      { type: 'added', id: 'a', value: record('a', 1) },
      { type: 'removed', id: 'a' },
    ]);
    live.acceptRemoval('a');
    live.applyListener([{ type: 'added', id: 'a', value: record('a', 1, 'recreated') }]);
    expect(labels(live)).toEqual(['recreated']);
  });

  it('clears listener and confirmed state on reset', () => {
    const live = collection();
    live.applyListener([{ type: 'added', id: 'a', value: record('a', 1) }]);
    live.accept(record('b', 1));
    live.reset();
    expect(live.values()).toEqual([]);
  });
});
