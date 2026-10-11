import { PhotoDiagnostics } from './PhotoDiagnostics';
import { useMutationState } from './mutation-activity';
import { useEffect, useRef, useState } from 'react';
import type { FirebaseServices } from '../data/firebase';
import { createRoom } from '../data/capture-repository';
import { captureInputSchema } from '../domain/item';
import { CURRENCIES, parseMoney } from '../domain/organize';
import type { Item, Room } from '../domain/item';
import { PhotoSlots } from './PhotoSlots';
import { PrivatePhoto } from './PrivatePhoto';
import type { PhotoSession } from '../media/photo-session';
import { MAX_PHOTOS, preparePhoto } from '../media/processing';
import type { CaptureAttempt } from '../media/capture';
import { saveAttempt } from '../media/capture';
import { PhotoInputs } from './PhotoInputs';
import { captureFailureDetail } from '../media/capture-errors';

export function CaptureForm({
  services,
  inventoryId,
  rooms,
  signal,
  onRoom,
  onSaved,
  onAttempt,
  roomRequest,
  defaultCurrency,
  session,
  onOpen,
}: {
  services: FirebaseServices;
  inventoryId: string;
  rooms: Room[];
  signal: AbortSignal;
  onRoom: (room: Room) => void;
  onSaved: (item: Item) => Promise<void>;
  onAttempt: (id: string) => Promise<void>;
  roomRequest: { sequence: number; room: string };
  defaultCurrency: string | null;
  session: PhotoSession;
  onOpen: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  const [roomName, setRoomName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useMutationState();
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string>();
  const [diagnosticFailure, setDiagnosticFailure] = useState<unknown>();
  const [locked, setLocked] = useState(false);
  const attempt = useRef<CaptureAttempt | undefined>(undefined);
  const nameField = useRef<HTMLInputElement>(null);
  const [focusAfterSave, setFocusAfterSave] = useState(false);
  useEffect(() => {
    if (focusAfterSave && !busy && !locked) {
      nameField.current?.focus();
      setFocusAfterSave(false);
    }
  }, [focusAfterSave, busy, locked]);
  const [roomBusy, setRoomBusy] = useMutationState();
  const [quantity, setQuantity] = useState('1');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency ?? '');
  const [serialNumber, setSerialNumber] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [recent, setRecent] = useState<Item[]>([]);
  const consumedRequest = useRef(-1);
  useEffect(() => {
    if (consumedRequest.current === roomRequest.sequence) return;
    consumedRequest.current = roomRequest.sequence;
    if (!busy && !locked && roomRequest.room !== 'sticky') {
      const available = rooms.some(
        (value) => value.id === roomRequest.room && value.archivedAt === null,
      );
      if (roomRequest.room === 'none' || available) setRoom(available ? roomRequest.room : '');
    }
  }, [roomRequest, rooms, busy, locked]);
  function select(selected: File[], append = false) {
    setError(undefined);
    setDiagnosticFailure(undefined);
    setStatus('');
    const next = append ? [...files, ...selected] : selected;
    setFiles(next);
    if (next.length > MAX_PHOTOS) {
      setError('Choose at most two photos. Your original files are unchanged.');
      return;
    }
    setFiles(next);
  }
  async function addRoom() {
    setError(undefined);
    setDiagnosticFailure(undefined);
    if (!roomName.trim()) {
      setError('Enter a room name.');
      return;
    }
    const existing = rooms.find(
      (value) =>
        value.archivedAt === null &&
        value.name.toLocaleLowerCase() === roomName.trim().toLocaleLowerCase(),
    );
    if (existing) {
      setRoom(existing.id);
      setRoomName('');
      setStatus('Selected the existing room.');
      return;
    }
    setRoomBusy(true);
    try {
      const created = await createRoom(
        services.db,
        inventoryId,
        roomName,
        Math.min(100000, rooms.length),
      );
      signal.throwIfAborted();
      onRoom(created);
      setRoom(created.id);
      setRoomName('');
    } catch {
      if (!signal.aborted)
        setError('Room creation could not be confirmed. Refresh rooms before retrying.');
    } finally {
      setRoomBusy(false);
    }
  }
  async function save(reviewed: boolean) {
    let acknowledged = false;
    setError(undefined);
    setDiagnosticFailure(undefined);
    setStatus('');
    if (!name.trim() || name.trim().length > 200) {
      setError('Enter an item name, up to 200 characters.');
      return;
    }
    if (files.length > MAX_PHOTOS) {
      setError('Choose at most two photos, or clear the selection to save without photos.');
      return;
    }
    setBusy(true);
    try {
      if (!attempt.current) {
        const input = captureInputSchema.parse({
          name: name.trim(),
          roomId: room || null,
          reviewStatus: reviewed ? 'reviewed' : 'needs_review',
          quantity: Number(quantity),
          estimatedValue: parseMoney(amount, currency),
          serialNumber: serialNumber.trim() || null,
          category: category.trim() || null,
          notes,
          photos: [],
        });
        const id = crypto.randomUUID();
        const prepared = [];
        for (const file of files) {
          setStatus('Preparing optimized photos…');
          prepared.push(await preparePhoto(file, inventoryId, id, crypto.randomUUID(), signal));
        }
        signal.throwIfAborted();
        attempt.current = {
          id,
          prepared,
          input: {
            ...input,
            photos: prepared.map((entry) => entry.photo),
          },
        };
        setLocked(true);
      }
      const saved = await saveAttempt(services, inventoryId, attempt.current, signal, (text) => {
        if (!signal.aborted) setStatus(text);
      });
      signal.throwIfAborted();
      acknowledged = true;
      attempt.current = undefined;
      setLocked(false);
      setName('');
      setFiles([]);
      setQuantity('1');
      setAmount('');
      setCurrency(defaultCurrency ?? '');
      setSerialNumber('');
      setCategory('');
      setNotes('');
      setRecent((values) => [saved, ...values].slice(0, 5));
      setStatus(`Saved ${saved.name}. Ready for the next thing.`);
      await onSaved(saved);
      signal.throwIfAborted();
    } catch (failure) {
      if (!signal.aborted) {
        setDiagnosticFailure(acknowledged ? undefined : failure);
        if (!acknowledged) setStatus('');
        setError(
          acknowledged
            ? 'Capture finished, but the inventory could not refresh. Reload to see the saved item.'
            : attempt.current
              ? `${captureFailureDetail(failure)} Capture is unfinished. Retry the same attempt, or reload to recover or explicitly discard it. Your selection is retained.`.trim()
              : failure instanceof Error
                ? failure.message
                : 'Could not prepare this photo. Choose a smaller JPEG or PNG.',
        );
        if (attempt.current) await onAttempt(attempt.current.id);
      }
    } finally {
      setBusy(false);
      if (acknowledged && !signal.aborted) setFocusAfterSave(true);
    }
  }
  return (
    <section className="capture-panel" aria-labelledby="capture-title">
      <p className="eyebrow">One thing at a time</p>
      <h2 id="capture-title">Add a thing</h2>
      <p className="supporting">
        A name is enough to start. Photos are optional now or later. Keep the room selected as you
        go.
      </p>
      <form
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !busy && !roomBusy) {
            event.preventDefault();
            void save(true);
          }
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void save(false);
        }}
      >
        <fieldset disabled={busy || locked || roomBusy}>
          <div className="capture-room-bar">
            <p className="capture-room-heading">
              Capturing in {rooms.find((value) => value.id === room)?.name ?? 'No room'}
            </p>
            <details className="capture-room-picker">
              <summary>Change room</summary>
              <label>
                Capture room
                <select
                  aria-label="Capture room"
                  value={room}
                  onChange={(event) => setRoom(event.target.value)}
                >
                  <option value="">Unassigned</option>
                  {rooms
                    .filter((value) => value.archivedAt === null)
                    .map((value) => (
                      <option key={value.id} value={value.id}>
                        {value.name}
                      </option>
                    ))}
                </select>
              </label>
              <div className="room-create">
                <label>
                  New room name
                  <input
                    value={roomName}
                    maxLength={100}
                    onChange={(event) => setRoomName(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={roomBusy}
                  onClick={() => void addRoom()}
                >
                  {roomBusy ? 'Adding…' : 'Add room'}
                </button>
              </div>
            </details>
          </div>
          <label>
            Item name
            <input
              ref={nameField}
              aria-label="Item name"
              value={name}
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
            />
          </label>
          <PhotoSlots files={files} disabled={busy || locked || roomBusy} select={select} />
          <PhotoInputs onSelect={select} disabled={busy || locked || roomBusy} />
          <details className="capture-details">
            <summary>Details</summary>
            <label>
              Quantity
              <input
                aria-label="Capture quantity"
                type="number"
                min="1"
                max="100000"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
            <label>
              Total estimated value
              <input
                aria-label="Capture total estimated value"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            <label>
              Currency
              <select
                aria-label="Capture value currency"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
              >
                <option value="">Choose currency</option>
                {CURRENCIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Serial number
              <input
                aria-label="Capture serial number"
                maxLength={200}
                value={serialNumber}
                onChange={(event) => setSerialNumber(event.target.value)}
              />
            </label>
            <label>
              Category
              <input
                aria-label="Capture category"
                maxLength={100}
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              />
            </label>
            <label>
              Notes
              <textarea
                aria-label="Capture notes"
                maxLength={10000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
          </details>
        </fieldset>
        {files.length > 0 && (
          <>
            <ul className="selected-files">
              {files.map((file, index) => (
                <li key={index}>{file.name}</li>
              ))}
            </ul>
            <button
              type="button"
              className="text-button"
              disabled={busy || locked}
              onClick={() => {
                setFiles([]);
                setError(undefined);
                setDiagnosticFailure(undefined);
              }}
            >
              Clear selected photos
            </button>
          </>
        )}
        <p className="supporting">
          Up to two photos · {files.length} selected. Optimized inventory photos are not a
          full-resolution photo backup. Your originals stay untouched.
        </p>
        <div className="save-actions">
          <button type="submit" className="primary-button" disabled={busy || roomBusy}>
            {busy ? 'Saving…' : locked ? 'Retry this capture' : 'Save & next'}
          </button>
          {!locked && (
            <button
              type="button"
              className="secondary-button"
              disabled={busy || roomBusy}
              onClick={() => void save(true)}
            >
              Save as reviewed
            </button>
          )}
        </div>
        {status && (
          <p role="status" className="save-status">
            {status}
          </p>
        )}
        {error && <PhotoDiagnostics failure={diagnosticFailure} />}
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
      </form>
      {!!recent.length && (
        <div className="capture-recent">
          <h3>Recently added</h3>
          {recent.map((item) => {
            const cover = item.photos.find((photo) => photo.id === item.coverPhotoId);
            return (
              <button
                type="button"
                className="capture-recent-item"
                key={item.id}
                aria-label={`Open recently added ${item.name}`}
                onClick={() => onOpen(item.id)}
              >
                {cover ? (
                  <PrivatePhoto file={cover.thumbnail} session={session} alt={item.name} />
                ) : (
                  <span className="recent-placeholder" aria-hidden="true">
                    ◌
                  </span>
                )}
                <span>{item.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
