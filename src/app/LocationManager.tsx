import { useMutationState } from './mutation-activity';
import { useState } from 'react';
import type { FirebaseServices } from '../data/firebase';
import type { Item, Room } from '../domain/item';
import { isVisible } from '../domain/item';
import type { Box } from '../domain/organize';
import { createRoom } from '../data/capture-repository';
import {
  archiveLocation,
  createBox,
  reactivateLocation,
  updateLocation,
} from '../data/organize-repository';

function LocationRow({
  value,
  kind,
  services,
  inventoryId,
  reload,
  browse,
  count,
}: {
  value: Room | Box;
  kind: 'room' | 'box';
  services: FirebaseServices;
  inventoryId: string;
  reload: () => Promise<void>;
  browse: (key: string) => void;
  count: number;
}) {
  const title = 'name' in value ? value.name : value.label;
  const [label, setLabel] = useState(title);
  const [base, setBase] = useState(value);
  const [sort, setSort] = useState(String(value.sortOrder));
  const [notes, setNotes] = useState('notes' in value ? value.notes : '');
  const [busy, setBusy] = useMutationState();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function perform(archive: boolean) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (archive) await archiveLocation(services.db, inventoryId, kind, value.id);
      else {
        const saved = await updateLocation(services.db, inventoryId, kind, base, {
          ...(label.trim() === ('name' in base ? base.name : base.label) ? {} : { label }),
          ...(Number(sort) === base.sortOrder ? {} : { sortOrder: Number(sort) }),
          ...(kind === 'box' && 'notes' in base && notes !== base.notes ? { notes } : {}),
        });
        setBase(saved);
      }
      setConfirm(false);
      setMessage(archive ? 'Archived' : 'Location saved');
      await reload();
    } catch (failure) {
      setError(
        failure instanceof Error && /Move all|changed elsewhere/.test(failure.message)
          ? failure.message
          : 'Could not save this location. Check its name/order and refresh before retrying.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset
      disabled={busy}
      aria-label={`${kind === 'room' ? 'Room' : 'Box'} ${title}`}
      className="location-row"
    >
      <legend>
        {title}
        {value.archivedAt ? ' · archived' : ''} · {count} owned entries
      </legend>
      {base.revision !== value.revision && (
        <p role="status">This location changed. Load its latest fields before saving.</p>
      )}
      <button
        className="text-button"
        onClick={() => {
          setBase(value);
          setLabel(title);
          setSort(String(value.sortOrder));
          setNotes('notes' in value ? value.notes : '');
          setError('');
        }}
      >
        Load latest location
      </button>
      <button
        className="text-button"
        onClick={() => browse(`${kind}:${value.id}`)}
        aria-label={`Browse ${title}`}
      >
        View contents
      </button>
      <div className="editor-fields">
        <label>
          {kind === 'room' ? 'Room name' : 'Box label'}
          <input maxLength={100} value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label>
          Sort order
          <input
            type="number"
            min={0}
            max={100000}
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          />
        </label>
      </div>
      {kind === 'box' && (
        <label>
          Box notes
          <textarea
            maxLength={10000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
      )}
      <div className="save-actions">
        <button className="secondary-button" onClick={() => void perform(false)}>
          Save location
        </button>
        {!value.archivedAt && (
          <button className="text-button" onClick={() => setConfirm(true)}>
            Archive
          </button>
        )}
        {value.archivedAt && (
          <button
            className="secondary-button"
            onClick={() => {
              setBusy(true);
              setError('');
              void reactivateLocation(services.db, inventoryId, kind, value.id)
                .then(reload)
                .then(() => setMessage('Location reactivated'))
                .catch(() => setError('Could not reactivate this location. Refresh and retry.'))
                .finally(() => setBusy(false));
            }}
          >
            Reactivate location
          </button>
        )}
      </div>
      {confirm && (
        <div className="confirmation">
          <p>
            Archive {title}?{' '}
            {kind === 'box' ? 'Unpack owned items first.' : 'Room tags are retained.'} Labels remain
            readable.
          </p>
          <button className="secondary-button" onClick={() => void perform(true)}>
            Confirm archive
          </button>
          <button className="text-button" onClick={() => setConfirm(false)}>
            Cancel
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </fieldset>
  );
}
export function LocationManager({
  rooms,
  boxes,
  items,
  services,
  inventoryId,
  reload,
  browse,
}: {
  rooms: Room[];
  boxes: Box[];
  items: Item[];
  services: FirebaseServices;
  inventoryId: string;
  reload: () => Promise<void>;
  browse: (key: string) => void;
}) {
  const [room, setRoom] = useState('');
  const [box, setBox] = useState('');
  const [busy, setBusy] = useMutationState();
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<'room' | 'box'>();
  async function create(kind: 'room' | 'box', confirmed = false) {
    const label = (kind === 'room' ? room : box).trim();
    const duplicate =
      kind === 'room'
        ? rooms.some((value) => value.name.toLocaleLowerCase() === label.toLocaleLowerCase())
        : boxes.some((value) => value.label.toLocaleLowerCase() === label.toLocaleLowerCase());
    if (duplicate && !confirmed) {
      setConfirm(kind);
      return;
    }
    setBusy(true);
    setError('');
    setConfirm(undefined);
    try {
      if (kind === 'room') {
        await createRoom(services.db, inventoryId, room, Math.min(100000, rooms.length));
        setRoom('');
      } else {
        await createBox(services.db, inventoryId, box, Math.min(100000, boxes.length));
        setBox('');
      }
      await reload();
    } catch {
      setError(
        'Could not create the location. Enter a nonblank label of at most 100 characters, and check your connection.',
      );
    } finally {
      setBusy(false);
    }
  }
  const counts = new Map<string, number>();
  for (const item of items.filter(isVisible)) {
    for (const key of [
      item.roomId ? `room:${item.roomId}` : '',
      item.boxId ? `box:${item.boxId}` : '',
    ]) {
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return (
    <section aria-label="Rooms and boxes" className="location-manager">
      <h2>Rooms and boxes</h2>
      <p className="supporting">
        Room tags stay independent of packing. Labels can change without rewriting items. Counts are
        entries, not summed quantities.
      </p>
      <fieldset disabled={busy}>
        <legend>Create locations</legend>
        <div className="editor-fields">
          <label>
            New room name
            <input maxLength={100} value={room} onChange={(event) => setRoom(event.target.value)} />
          </label>
          <button className="secondary-button" onClick={() => void create('room')}>
            Create room
          </button>
          <label>
            New box label
            <input
              maxLength={100}
              placeholder="B001"
              value={box}
              onChange={(event) => setBox(event.target.value)}
            />
          </label>
          <button className="secondary-button" onClick={() => void create('box')}>
            Create box
          </button>
        </div>
        {confirm && (
          <div className="confirmation">
            <p>
              A location with this label already exists. They will have different identities. Create
              another?
            </p>
            <button className="secondary-button" onClick={() => void create(confirm, true)}>
              Create duplicate label
            </button>
            <button className="text-button" onClick={() => setConfirm(undefined)}>
              Cancel
            </button>
          </div>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <div className="location-list">
        {rooms.map((value) => (
          <LocationRow
            key={value.id}
            value={value}
            kind="room"
            services={services}
            inventoryId={inventoryId}
            reload={reload}
            browse={browse}
            count={counts.get(`room:${value.id}`) ?? 0}
          />
        ))}
        {boxes.map((value) => (
          <LocationRow
            key={value.id}
            value={value}
            kind="box"
            services={services}
            inventoryId={inventoryId}
            reload={reload}
            browse={browse}
            count={counts.get(`box:${value.id}`) ?? 0}
          />
        ))}
      </div>
    </section>
  );
}
