import { PhotoDiagnostics } from './PhotoDiagnostics';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { FirebaseServices } from '../data/firebase';
import { createRoom, matchesCaptureIdentity, loadItem } from '../data/capture-repository';
import { editItem } from '../data/organize-repository';
import type { Item, Room } from '../domain/item';
import { roomLabel } from '../domain/browse';
import { MAX_PHOTOS } from '../media/processing';
import { PhoneCaptureQueue, MAX_QUEUED_CAPTURES } from '../media/phone-capture-queue';
import type { PhoneCaptureEntry } from '../media/phone-capture-queue';
import { saveQueuedCapture } from '../media/phone-capture';
import { discardAttempt } from '../media/capture';
import { captureFailureDetail } from '../media/capture-errors';
import type { PhotoSession } from '../media/photo-session';
import { PrivatePhoto } from './PrivatePhoto';
import { PhotoSlots } from './PhotoSlots';
import { BottomSheet } from './BottomSheet';
import { useMutationState } from './mutation-activity';

export function PhoneCapture({
  services,
  inventoryId,
  ownerUid,
  items,
  rooms,
  signal,
  session,
  open,
  close,
  reopen,
  onRoom,
  onSaved,
  onAttempt,
  onOpen,
}: {
  services: FirebaseServices;
  inventoryId: string;
  ownerUid: string;
  items: Item[];
  rooms: Room[];
  signal: AbortSignal;
  session: PhotoSession;
  open: boolean;
  close: () => void;
  reopen: () => void;
  onRoom: (room: Room) => void;
  onSaved: (settledId?: string) => Promise<void>;
  onAttempt: (id: string) => Promise<void>;
  onOpen: (id: string) => void;
}) {
  const preference = `my-things:capture-room:${services.app.options.projectId}:${inventoryId}:${ownerUid}`;
  const [room, setRoom] = useState(() => {
    try {
      const stored = localStorage.getItem(preference);
      return rooms.some((value) => value.id === stored && value.archivedAt === null) ? stored! : '';
    } catch {
      return '';
    }
  });
  const [preferenceNotice, setPreferenceNotice] = useState('');
  const [step, setStep] = useState<'shoot' | 'name'>('shoot');
  const [name, setName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [roomPicker, setRoomPicker] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomBusy, setRoomBusy] = useMutationState();
  const [, setQueueBusy] = useMutationState();
  const [actionBusy, setActionBusy] = useMutationState();
  const [entries, setEntries] = useState<Readonly<PhoneCaptureEntry>[]>([]);
  const [toast, setToast] = useState<Item>();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const secondPhoto = useRef<HTMLInputElement>(null);
  const callbacks = useRef({ onSaved, onAttempt });
  callbacks.current = { onSaved, onAttempt };
  const queueRef = useRef<PhoneCaptureQueue>(null);
  if (!queueRef.current)
    queueRef.current = new PhoneCaptureQueue(
      (entry) =>
        saveQueuedCapture(
          services,
          inventoryId,
          entry,
          signal,
          (text) => queueRef.current?.progress(entry.id, text),
          (id) => callbacks.current.onAttempt(id),
        ),
      () => {
        const next = queueRef.current?.snapshot() ?? [];
        if (!signal.aborted) {
          setEntries(next);
          setQueueBusy(next.length > 0);
        }
      },
      async (item) => {
        await callbacks.current.onSaved(item.id);
        if (!signal.aborted) {
          setToast(item);
          setNotice('');
          setError('');
        }
      },
    );
  const queue = queueRef.current;
  useEffect(() => {
    const abort = () => queue.dispose();
    signal.addEventListener('abort', abort);
    return () => {
      signal.removeEventListener('abort', abort);
      queue.dispose();
    };
  }, [queue, signal]);
  useEffect(() => {
    try {
      localStorage.setItem(preference, room);
      setPreferenceNotice('');
    } catch {
      setPreferenceNotice(
        'Room stays for this session; this device could not retain the preference.',
      );
    }
  }, [room, preference]);
  useEffect(() => {
    if (room && !rooms.some((value) => value.id === room && value.archivedAt === null)) setRoom('');
  }, [room, rooms]);
  useEffect(() => {
    if (!toast || actionBusy) return;
    const timer = window.setTimeout(() => setToast(undefined), 5000);
    return () => window.clearTimeout(timer);
  }, [toast, actionBusy]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!entries.length) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [entries.length]);
  function showName() {
    flushSync(() => {
      setStep('name');
      setError('');
    });
    nameField.current?.focus();
  }
  function select(selected: File[], append = false) {
    setFiles((current) => (append ? [...current, ...selected] : selected));
    showName();
  }
  function enqueue() {
    if (!name.trim() || name.trim().length > 200) {
      setError('Enter an item name, up to 200 characters.');
      return;
    }
    if (files.length > MAX_PHOTOS) {
      setError('Choose at most two photos, or clear the selection to save without photos.');
      return;
    }
    try {
      queue.enqueue(name.trim(), room || null, files);
      setName('');
      setFiles([]);
      setStep('shoot');
      setError('');
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Could not queue this capture. Your selection is retained.',
      );
    }
  }
  async function addRoom() {
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
      return;
    }
    setRoomBusy(true);
    setError('');
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
  async function undo(item: Item) {
    setActionBusy(true);
    setError('');
    try {
      await editItem(services.db, inventoryId, item, { kind: 'trash' }, signal);
      signal.throwIfAborted();
      setToast(undefined);
      setNotice(`Moved ${item.name} to Trash.`);
      await onSaved();
    } catch {
      if (!signal.aborted) {
        setError(
          'Undo could not be confirmed, or this item changed. Open it to review the latest details before moving it to Trash.',
        );
        await onSaved();
      }
    } finally {
      setActionBusy(false);
    }
  }
  const failed = entries[0]?.status === 'failed' ? entries[0] : undefined;
  async function discard() {
    if (!failed) return;
    setActionBusy(true);
    setError('');
    try {
      if (failed.attempt) {
        const current = await loadItem(services.db, inventoryId, failed.id);
        if (current) {
          if (
            !['draft', 'deleting'].includes(current.recordState) ||
            current.coverPhotoId !== null ||
            current.deletedAt !== null ||
            !matchesCaptureIdentity(current, failed.attempt.input)
          )
            throw new Error(
              'This record is already saved or changed. Open recovery before discarding.',
            );
          await discardAttempt(services, inventoryId, current, signal);
        }
      }
      signal.throwIfAborted();
      await onSaved(failed.id);
      signal.throwIfAborted();
      queue.discarded(failed.id);
      setDiscardConfirm(false);
      setNotice(`Discarded unfinished ${failed.name}. Your originals are unchanged.`);
    } catch (failure) {
      if (!signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Cleanup could not be confirmed. Retry the same capture or reload recovery.',
        );
    } finally {
      setActionBusy(false);
    }
  }
  const activity = !!entries.length && (
    <div className={open ? 'phone-upload-progress' : 'phone-upload-progress outside-capture'}>
      <p role="status">
        {entries.length} captures pending · {entries[0]?.progress}
      </p>
      {failed && (
        <div>
          <p role="alert">
            Could not save {failed.name}. {captureFailureDetail(failed.error)}{' '}
            {failed.attempt
              ? 'Capture is unfinished; its original selection and identity are retained.'
              : 'Your original selection is retained.'}
          </p>
          <PhotoDiagnostics failure={failed.error} />
          <button
            type="button"
            className="secondary-button"
            disabled={actionBusy}
            onClick={() => {
              setDiscardConfirm(false);
              queue.retry();
            }}
          >
            Retry queued capture
          </button>
          {!failed.attempt && (
            <button
              type="button"
              className="text-button"
              disabled={actionBusy}
              onClick={() => {
                const original = queue.editFailed();
                reopen();
                setName(original.name);
                setFiles(original.files);
                setRoom(
                  original.roomId &&
                    rooms.some((value) => value.id === original.roomId && value.archivedAt === null)
                    ? original.roomId
                    : '',
                );
                showName();
              }}
            >
              Edit failed capture
            </button>
          )}
          <button
            type="button"
            className="text-button"
            disabled={actionBusy}
            onClick={() => setDiscardConfirm(true)}
          >
            Discard unfinished capture
          </button>
          {discardConfirm && (
            <div className="confirmation">
              <p>
                Discard this unfinished capture and its partial uploads? Original photos remain on
                your device.
              </p>
              <button
                type="button"
                className="primary-button"
                disabled={actionBusy}
                onClick={() => void discard()}
              >
                Confirm discard
              </button>
              <button
                type="button"
                className="text-button"
                disabled={actionBusy}
                onClick={() => setDiscardConfirm(false)}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
      <small>Uploads stay in this tab. Keep it open until they finish.</small>
    </div>
  );
  const cover = toast?.photos.find((photo) => photo.id === toast.coverPhotoId);
  const toastView = toast && (
    <div className="phone-saved-toast" role="status">
      {cover ? (
        <PrivatePhoto file={cover.thumbnail} session={session} alt={toast.name} />
      ) : (
        <span aria-hidden="true">✓</span>
      )}
      <div>
        <button
          type="button"
          className="text-button"
          aria-label={`Open saved ${toast.name}`}
          onClick={() => onOpen(toast.id)}
        >
          <strong>Saved {toast.name}</strong>
        </button>
        <small>Saved to {roomLabel(toast.roomId, rooms)} · in review inbox</small>
      </div>
      <button
        type="button"
        className="text-button"
        disabled={actionBusy}
        onClick={() => void undo(toast)}
      >
        Undo
      </button>
      {error && (
        <button type="button" className="text-button" onClick={() => onOpen(toast.id)}>
          Open saved item
        </button>
      )}
    </div>
  );
  return (
    <>
      {!open && activity}
      {!open && (toast || notice || error) && (
        <aside className="phone-capture-notice">
          {toastView}
          {notice && <p role="status">{notice}</p>}
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
        </aside>
      )}
      <section className={'phone-capture ' + step} aria-label="Phone capture" hidden={!open}>
        <header className="phone-capture-header">
          <button type="button" className="text-button" aria-label="Close capture" onClick={close}>
            ×
          </button>
          {step === 'shoot' ? (
            <button
              type="button"
              className="phone-room-pill"
              aria-label="Choose capture room"
              onClick={() => setRoomPicker(true)}
            >
              Room · {roomLabel(room || null, rooms)} ▾
            </button>
          ) : (
            <span>{roomLabel(room || null, rooms)}</span>
          )}
          <span>
            {
              items.filter(
                (item) =>
                  item.recordState === 'ready' &&
                  item.createdAt.toDate().toDateString() === new Date().toDateString(),
              ).length
            }{' '}
            today
          </span>
        </header>
        {preferenceNotice && <p className="supporting">{preferenceNotice}</p>}
        {open && toastView}
        {notice && (
          <p role="status" className="save-status">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        {activity}
        <div className="phone-shoot" hidden={step !== 'shoot'}>
          <p className="eyebrow">One thing at a time</p>
          <h2>Take a photo</h2>
          <p>A photo helps you find it later. You can also start with a name.</p>
          <input
            ref={camera}
            hidden
            type="file"
            aria-label="Take a photo"
            accept="image/*,.heic,.heif"
            capture="environment"
            onChange={(event) => {
              if (event.target.files?.length) select(Array.from(event.target.files));
              event.target.value = '';
            }}
          />
          <button type="button" className="phone-shutter" onClick={() => camera.current?.click()}>
            Take photo
          </button>
          <div className="phone-shoot-options">
            <button type="button" className="text-button" onClick={() => library.current?.click()}>
              Library
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setFiles([]);
                showName();
              }}
            >
              No photo
            </button>
          </div>
          <input
            ref={library}
            hidden
            type="file"
            multiple
            aria-label="Choose photos"
            accept="image/*,.heic,.heif"
            onChange={(event) => {
              if (event.target.files?.length) select(Array.from(event.target.files));
              event.target.value = '';
            }}
          />
        </div>
        <form
          className="phone-name"
          hidden={step !== 'name'}
          onSubmit={(event) => {
            event.preventDefault();
            enqueue();
          }}
        >
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setStep('shoot');
              setFiles([]);
              setError('');
            }}
          >
            ‹ Retake
          </button>
          {files.length > 0 && (
            <>
              <PhotoSlots
                files={files}
                disabled={false}
                select={(selected, append) => select(selected, append)}
              />
              <ul className="selected-files">
                {files.map((file, index) => (
                  <li key={index}>{file.name}</li>
                ))}
              </ul>
              <button type="button" className="text-button" onClick={() => setFiles([])}>
                Clear selected photos
              </button>
            </>
          )}
          <input
            ref={secondPhoto}
            hidden
            type="file"
            aria-label="Add second photo"
            accept="image/*,.heic,.heif"
            capture="environment"
            onChange={(event) => {
              if (event.target.files?.length) select(Array.from(event.target.files), true);
              event.target.value = '';
            }}
          />
          {files.length === 1 && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => secondPhoto.current?.click()}
            >
              + 2nd photo
            </button>
          )}
          <label>
            <span className="eyebrow">What is it?</span>
            <input
              ref={nameField}
              aria-label="Item name"
              className="phone-name-input"
              maxLength={200}
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="primary-button"
            disabled={entries.length >= MAX_QUEUED_CAPTURES}
          >
            Save & next
          </button>
          {entries.length >= MAX_QUEUED_CAPTURES && (
            <p className="supporting">
              The queue is full. Your name and photos stay here while pending captures finish.
            </p>
          )}
        </form>
        {roomPicker && (
          <BottomSheet label="Capture room picker" close={() => setRoomPicker(false)}>
            <fieldset disabled={roomBusy}>
              <label>
                Capture room
                <select
                  aria-label="Capture room"
                  value={room}
                  onChange={(event) => setRoom(event.target.value)}
                >
                  <option value="">No room</option>
                  {rooms
                    .filter((value) => value.archivedAt === null)
                    .map((value) => (
                      <option key={value.id} value={value.id}>
                        {value.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                New room name
                <input
                  maxLength={100}
                  value={roomName}
                  onChange={(event) => setRoomName(event.target.value)}
                />
              </label>
              <button type="button" className="secondary-button" onClick={() => void addRoom()}>
                {roomBusy ? 'Adding…' : '+ New room'}
              </button>
            </fieldset>
          </BottomSheet>
        )}
      </section>
    </>
  );
}
