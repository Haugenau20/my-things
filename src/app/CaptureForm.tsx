import { useRef, useState } from 'react';
import type { FirebaseServices } from '../data/firebase';
import { createRoom } from '../data/capture-repository';
import type { Room } from '../domain/item';
import { MAX_PHOTOS, preparePhoto } from '../media/processing';
import type { CaptureAttempt } from '../media/capture';
import { saveAttempt } from '../media/capture';
import { PhotoInputs } from './PhotoInputs';

export function CaptureForm({
  services,
  inventoryId,
  rooms,
  signal,
  onRoom,
  onSaved,
  onAttempt,
}: {
  services: FirebaseServices;
  inventoryId: string;
  rooms: Room[];
  signal: AbortSignal;
  onRoom: (room: Room) => void;
  onSaved: () => Promise<void>;
  onAttempt: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  const [roomName, setRoomName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string>();
  const [locked, setLocked] = useState(false);
  const attempt = useRef<CaptureAttempt | undefined>(undefined);
  const nameField = useRef<HTMLInputElement>(null);
  const [roomBusy, setRoomBusy] = useState(false);
  function select(selected: File[], append = false) {
    setError(undefined);
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
      if (!signal.aborted) setRoomBusy(false);
    }
  }
  async function save(reviewed: boolean) {
    setError(undefined);
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
            name: name.trim(),
            roomId: room || null,
            reviewStatus: reviewed ? 'reviewed' : 'needs_review',
            photos: prepared.map((entry) => entry.photo),
          },
        };
        setLocked(true);
      }
      const saved = await saveAttempt(services, inventoryId, attempt.current, signal, (text) => {
        if (!signal.aborted) setStatus(text);
      });
      signal.throwIfAborted();
      attempt.current = undefined;
      setLocked(false);
      setName('');
      setFiles([]);
      setStatus(`Saved ${saved.name}. Ready for the next thing.`);
      await onSaved();
      signal.throwIfAborted();
      nameField.current?.focus();
    } catch (failure) {
      if (!signal.aborted) {
        setStatus('');
        setError(
          attempt.current
            ? 'Capture is unfinished. Retry the same attempt, or reload to recover or explicitly discard it. Your selection is retained.'
            : failure instanceof Error
              ? failure.message
              : 'Could not prepare this photo. Choose a smaller JPEG or PNG.',
        );
        if (attempt.current) await onAttempt(attempt.current.id);
      }
    } finally {
      if (!signal.aborted) setBusy(false);
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
        onSubmit={(event) => {
          event.preventDefault();
          void save(false);
        }}
      >
        <fieldset disabled={busy || locked || roomBusy}>
          <label>
            Item name
            <input
              ref={nameField}
              value={name}
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
            />
          </label>
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
          <PhotoInputs onSelect={select} disabled={busy || locked || roomBusy} />
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
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
