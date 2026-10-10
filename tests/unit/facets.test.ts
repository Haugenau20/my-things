import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { captureDraft, parseItem } from '../../src/domain/item';
import { applyCommand, DEFAULT_FILTERS, filterItems } from '../../src/domain/organize';

const time = Timestamp.fromMillis(1000);
const item = () =>
  captureDraft({ name: 'Lamp', roomId: 'bedroom', photos: [], reviewStatus: 'needs_review' }, time);

describe('approved independent room and box facets', () => {
  it('captures a v2 room tag without packing or legacy fields', () => {
    expect(item()).toMatchObject({ schemaVersion: 2, roomId: 'bedroom', boxId: null });
    expect(item()).not.toHaveProperty('currentLocation');
    expect(item()).not.toHaveProperty('originalRoomId');
  });
  it('packing, reboxing and unpacking never change the room tag', () => {
    const packed = applyCommand(item(), { kind: 'pack', boxId: 'b001' }, time);
    const reboxed = applyCommand(packed, { kind: 'pack', boxId: 'b002' }, time);
    expect(reboxed).toMatchObject({ roomId: 'bedroom', boxId: 'b002' });
    expect(applyCommand(reboxed, { kind: 'pack', boxId: null }, time)).toMatchObject({
      roomId: 'bedroom',
      boxId: null,
    });
  });
  it('only an explicit setRoom changes or clears the room', () => {
    const packed = applyCommand(item(), { kind: 'pack', boxId: 'b001' }, time);
    const changed = applyCommand(packed, { kind: 'setRoom', roomId: 'study' }, time);
    expect(changed).toMatchObject({ roomId: 'study', boxId: 'b001' });
    expect(applyCommand(changed, { kind: 'setRoom', roomId: null }, time)).toMatchObject({
      roomId: null,
      boxId: 'b001',
    });
  });
  it.each(['sell', 'give_away'] as const)(
    'completing %s unpacks and reopening retains the room',
    (decision) => {
      const packed = applyCommand(item(), { kind: 'pack', boxId: 'b001' }, time);
      const gone = applyCommand(
        applyCommand(packed, { kind: 'decision', decision }, time),
        {
          kind: 'progress',
          progress: 'completed',
        },
        time,
      );
      expect(gone).toMatchObject({ roomId: 'bedroom', boxId: null });
      expect(() => applyCommand(gone, { kind: 'pack', boxId: 'b001' }, time)).toThrow(/Reopen/);
      expect(applyCommand(gone, { kind: 'progress', progress: 'not_started' }, time)).toMatchObject(
        {
          roomId: 'bedroom',
          boxId: null,
        },
      );
    },
  );
  it('rejects v1 and legacy-shaped records', () => {
    const record = item();
    expect(() => parseItem({ ...record, schemaVersion: 1 }, 'main', 'lamp')).toThrow();
    expect(() =>
      parseItem({ ...record, currentLocation: { kind: 'unassigned' } }, 'main', 'lamp'),
    ).toThrow();
  });
  it('combines room and box, with Gone and Trash separate from owned defaults', () => {
    const unpacked = { ...item(), id: 'unpacked' };
    const packed = { ...applyCommand(item(), { kind: 'pack', boxId: 'b001' }, time), id: 'packed' };
    const gone = {
      ...applyCommand(
        applyCommand(item(), { kind: 'decision', decision: 'sell' }, time),
        {
          kind: 'progress',
          progress: 'completed',
        },
        time,
      ),
      id: 'gone',
    };
    const { id: _id, ...goneRecord } = gone;
    void _id;
    const trash = { ...applyCommand(goneRecord, { kind: 'trash' }, time), id: 'trash' };
    const records = [unpacked, packed, gone, trash];
    const ids = (patch: Record<string, unknown>) =>
      filterItems(records, { ...DEFAULT_FILTERS, ...patch }).map((record) => record.id);
    expect(ids({ room: 'bedroom', box: 'unpacked' })).toEqual(['unpacked']);
    expect(ids({ room: 'bedroom', box: 'b001' })).toEqual(['packed']);
    expect(ids({})).toEqual(['unpacked', 'packed']);
    expect(ids({ box: 'gone' })).toEqual(['gone']);
    expect(ids({ trash: true })).toEqual(['trash']);
  });
});
