import { useMutationState } from './mutation-activity';
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { FirebaseServices } from '../data/firebase';
import type { Item, Room } from '../domain/item';
import {
  CURRENCIES,
  DECISIONS,
  PROGRESS,
  isDisposed,
  moneyInput,
  parseMoney,
} from '../domain/organize';
import type { Box, ItemCommand, MetadataPatch } from '../domain/organize';
import { editItem } from '../data/organize-repository';
import { RoomSelect, BoxSelect } from './LocationSelect';
import { roomLabel, boxLabel } from '../domain/browse';

function fields(item: Item, defaultCurrency: string | null) {
  return {
    name: item.name,
    quantity: String(item.quantity),
    serialNumber: item.serialNumber ?? '',
    notes: item.notes,
    category: item.category ?? '',
    amount: item.estimatedValue ? moneyInput(item.estimatedValue) : '',
    currency: item.estimatedValue?.currency ?? defaultCurrency ?? '',
  };
}
export function ItemEditor({
  item,
  inspector = false,
  rooms,
  boxes,
  services,
  inventoryId,
  defaultCurrency,
  signal,
  reload,
  next,
  setDefaultCurrency,
  requestDeletion,
}: {
  item: Item;
  inspector?: boolean;
  rooms: Room[];
  boxes: Box[];
  services: FirebaseServices;
  inventoryId: string;
  defaultCurrency: string | null;
  signal: AbortSignal;
  reload: () => Promise<void>;
  next: () => void;
  setDefaultCurrency: (currency: string) => Promise<void>;
  requestDeletion: (item: Item) => void;
}) {
  const [base, setBase] = useState(item);
  const [form, setForm] = useState(() => fields(item, defaultCurrency));
  const [roomOpen, setRoomOpen] = useState(false);
  const [boxOpen, setBoxOpen] = useState(false);
  const [room, setRoom] = useState(item.roomId ?? '');
  const [box, setBox] = useState(item.boxId ?? '');
  const [decision, setDecision] = useState(item.decision);
  const [progress, setProgress] = useState(item.progress);
  const [busy, setBusy] = useMutationState();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<{
    command: ItemCommand;
    message: string;
    label: string;
  }>();
  const resetControls = (value: Item) => {
    setRoom(value.roomId ?? '');
    setBox(value.boxId ?? '');
    setDecision(value.decision);
    setProgress(value.progress);
  };
  const reset = (value: Item) => {
    setBase(value);
    setForm(fields(value, defaultCurrency));
    resetControls(value);
  };
  const pending = item.photos.some((photo) => photo.state !== 'ready');
  const changed = item.revision !== base.revision;
  async function save(command: ItemCommand, text: string, detailsSaved = false) {
    setBusy(true);
    setError('');
    setMessage('');
    setConfirmation(undefined);
    try {
      const saved = await editItem(services.db, inventoryId, base, command, signal);
      if (!signal.aborted) {
        setBase(saved);
        resetControls(saved);
        if (detailsSaved) setForm(fields(saved, defaultCurrency));
        setMessage(text);
        await reload();
        return true;
      }
    } catch (failure) {
      if (!signal.aborted) {
        resetControls(base);
        setError(
          failure instanceof Error && /changed elsewhere|Reactivate/.test(failure.message)
            ? failure.message
            : 'Could not save. Refresh to check the current record before retrying.',
        );
        await reload();
      }
    } finally {
      if (!signal.aborted) setBusy(false);
    }
    return false;
  }
  function details(event: FormEvent) {
    event.preventDefault();
    try {
      const value = {
        name: form.name.trim(),
        quantity: Number(form.quantity),
        serialNumber: form.serialNumber || null,
        notes: form.notes,
        category: form.category || null,
        estimatedValue: parseMoney(form.amount, form.currency),
      };
      const patch: MetadataPatch = Object.fromEntries(
        Object.entries(value).filter(
          ([key, value]) =>
            JSON.stringify(value) !== JSON.stringify(base[key as keyof typeof value]),
        ),
      );
      void save({ kind: 'metadata', patch }, 'Details saved', true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Check the entered details.');
    }
  }
  const update = (key: keyof typeof form, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const request = (command: ItemCommand, message: string, label: string) =>
    setConfirmation({ command, message, label });
  const human = (value: string) => {
    const text = value.replaceAll('_', ' ');
    return text[0]!.toUpperCase() + text.slice(1);
  };
  function changeDecision(value: Item['decision']) {
    if (value !== base.decision && base.progress !== 'not_started')
      request(
        { kind: 'decision', decision: value },
        'Changing this decision resets progress and completion time.',
        'Confirm decision change',
      );
    else void save({ kind: 'decision', decision: value }, 'Decision saved');
  }
  function changeProgress(value: Item['progress']) {
    if (
      value === 'completed' &&
      ['sell', 'give_away'].includes(base.decision) &&
      base.progress !== 'completed'
    )
      request(
        { kind: 'progress', progress: value },
        'Completing this sale or donation clears its box and marks it Gone. Photos and the room tag remain.',
        'Confirm completion',
      );
    else void save({ kind: 'progress', progress: value }, 'Progress saved');
  }
  const detailForm = (
    <form onSubmit={details}>
      <fieldset disabled={busy || pending}>
        {!inspector && <legend>Details</legend>}
        <div className="editor-fields">
          <label>
            Name
            <input
              required
              maxLength={200}
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
            />
          </label>
          <label>
            Quantity
            <input
              type="number"
              min={1}
              max={100000}
              step={1}
              required
              value={form.quantity}
              onChange={(event) => update('quantity', event.target.value)}
            />
          </label>
          <label>
            Total estimated value
            <input
              inputMode="decimal"
              maxLength={32}
              placeholder="Unknown"
              value={form.amount}
              onChange={(event) => update('amount', event.target.value)}
            />
          </label>
          <label>
            Value currency
            <select
              aria-label="Value currency"
              value={form.currency}
              onChange={(event) => update('currency', event.target.value)}
            >
              <option value="">Choose currency</option>
              {CURRENCIES.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Serial number
            <input
              maxLength={200}
              value={form.serialNumber}
              onChange={(event) => update('serialNumber', event.target.value)}
            />
          </label>
          <label>
            Category
            <input
              maxLength={100}
              value={form.category}
              onChange={(event) => update('category', event.target.value)}
            />
          </label>
        </div>
        <label>
          Notes
          <textarea
            aria-label="Notes"
            rows={4}
            maxLength={10000}
            value={form.notes}
            onChange={(event) => update('notes', event.target.value)}
          />
        </label>
        <p className="supporting">
          Value is the total for all units in this entry. Blank means unknown; zero is a value. Use
          a dot for decimals. Saving details leaves review status unchanged.
        </p>
        <button className="primary-button" type="submit">
          Save details
        </button>
        {form.currency && form.currency !== defaultCurrency && (
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setBusy(true);
              setError('');
              setMessage('');
              void setDefaultCurrency(form.currency)
                .then(() => {
                  if (!signal.aborted)
                    setMessage('Default currency saved; existing values are unchanged.');
                })
                .catch(() => {
                  if (!signal.aborted)
                    setError(
                      'Could not save the currency default. Refresh settings before retrying.',
                    );
                })
                .finally(() => {
                  if (!signal.aborted) setBusy(false);
                });
            }}
          >
            Use this currency as inventory default
          </button>
        )}
      </fieldset>
    </form>
  );
  return (
    <section className="item-editor" aria-label="Edit item">
      {busy && <p role="status">Saving…</p>}
      {changed && !busy && (
        <p role="status">
          This item changed since these fields were loaded.{' '}
          <button
            className="text-button"
            onClick={() => {
              reset(item);
              setError('');
              setMessage('Latest details loaded');
            }}
          >
            Load latest details
          </button>
        </p>
      )}
      {pending && (
        <p role="status">Finish or cancel the pending photo operation before editing details.</p>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="save-status">
          {message}
        </p>
      )}
      {base.deletedAt !== null ? (
        <div className="save-actions">
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() =>
              void save({ kind: 'restore' }, 'Restored; the previous moving outcome is preserved')
            }
          >
            Restore item
          </button>
          <button
            className="text-button"
            disabled={busy || pending}
            onClick={() => requestDeletion(base)}
          >
            Delete permanently
          </button>
        </div>
      ) : (
        <>
          {!inspector && detailForm}
          {inspector ? (
            <>
              <fieldset
                disabled={busy || pending}
                aria-label="Inspector room"
                className="inspector-facet"
              >
                <legend>Room</legend>
                <span className="room-tag">{roomLabel(base.roomId, rooms)}</span>
                <button
                  className="text-button"
                  aria-expanded={roomOpen}
                  onClick={() => setRoomOpen(!roomOpen)}
                >
                  Change
                </button>
                {roomOpen && (
                  <RoomSelect
                    rooms={rooms}
                    label="Room tag"
                    value={room}
                    onChange={(value) => {
                      setRoom(value);
                      void save({ kind: 'setRoom', roomId: value || null }, 'Room saved');
                    }}
                  />
                )}
              </fieldset>
              <fieldset
                disabled={busy || pending || isDisposed(base)}
                aria-label="Inspector box"
                className="inspector-facet"
              >
                <legend>Box</legend>
                <span className={base.boxId ? 'box-tag' : 'packing-text'}>
                  {isDisposed(base)
                    ? 'Gone'
                    : base.boxId
                      ? boxLabel(base.boxId, boxes)
                      : 'Not packed'}
                </span>
                {base.boxId && (
                  <button
                    className="text-button"
                    onClick={() => void save({ kind: 'pack', boxId: null }, 'Packing saved')}
                  >
                    Unpack
                  </button>
                )}
                <button
                  className="text-button"
                  aria-expanded={boxOpen}
                  onClick={() => setBoxOpen(!boxOpen)}
                >
                  {base.boxId ? 'Change' : 'Pack'}
                </button>
                {boxOpen && (
                  <BoxSelect
                    boxes={boxes}
                    label="Packing box"
                    value={box}
                    onChange={(value) => {
                      setBox(value);
                      void save({ kind: 'pack', boxId: value || null }, 'Packing saved');
                    }}
                  />
                )}
              </fieldset>
              <fieldset
                disabled={busy || pending}
                aria-label="Moving decision"
                className="inspector-pills"
              >
                <legend>Decision</legend>
                {DECISIONS.map((value) => (
                  <button
                    key={value}
                    className="decision-pill"
                    aria-pressed={decision === value}
                    onClick={() => {
                      setDecision(value);
                      changeDecision(value);
                    }}
                  >
                    {human(value)}
                  </button>
                ))}
              </fieldset>
              <fieldset
                disabled={busy || pending}
                aria-label="Moving progress"
                className="inspector-pills"
              >
                <legend>Progress</legend>
                {PROGRESS.map((value) => (
                  <button
                    key={value}
                    className="progress-pill"
                    aria-pressed={progress === value}
                    disabled={base.decision === 'undecided' && value !== 'not_started'}
                    onClick={() => {
                      setProgress(value);
                      changeProgress(value);
                    }}
                  >
                    {human(value)}
                  </button>
                ))}
              </fieldset>
              <fieldset disabled={busy || pending}>
                <legend>Review</legend>
                <div className="save-actions">
                  <button
                    className="secondary-button"
                    disabled={base.reviewStatus === 'reviewed'}
                    onClick={() =>
                      void save(
                        { kind: 'metadata', patch: { reviewStatus: 'reviewed' } },
                        'Reviewed',
                      )
                    }
                  >
                    Mark reviewed
                  </button>
                  <button
                    className="secondary-button"
                    disabled={base.reviewStatus === 'needs_review'}
                    onClick={() =>
                      void save(
                        { kind: 'metadata', patch: { reviewStatus: 'needs_review' } },
                        'Marked for review',
                      )
                    }
                  >
                    Needs review
                  </button>
                  <button className="text-button" onClick={next}>
                    Next item needing review
                  </button>
                </div>
              </fieldset>
              <details className="inspector-details">
                <summary>Details</summary>
                {detailForm}
              </details>
            </>
          ) : (
            <>
              <fieldset disabled={busy || pending}>
                <legend>Review</legend>
                <p>{base.reviewStatus === 'reviewed' ? 'Reviewed' : 'Needs review'}</p>
                <div className="save-actions">
                  <button
                    className="secondary-button"
                    onClick={() =>
                      void save(
                        { kind: 'metadata', patch: { reviewStatus: 'reviewed' } },
                        'Reviewed',
                      )
                    }
                  >
                    Mark reviewed
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      void save(
                        { kind: 'metadata', patch: { reviewStatus: 'needs_review' } },
                        'Marked for review',
                      )
                    }
                  >
                    Needs review
                  </button>
                  <button className="text-button" onClick={next}>
                    Next item needing review
                  </button>
                </div>
              </fieldset>
              <fieldset disabled={busy || pending}>
                <legend>Room</legend>
                <RoomSelect rooms={rooms} label="Room tag" value={room} onChange={setRoom} />
                <button
                  className="secondary-button"
                  onClick={() => void save({ kind: 'setRoom', roomId: room || null }, 'Room saved')}
                >
                  Set room
                </button>
              </fieldset>
              <fieldset disabled={busy || pending || isDisposed(base)}>
                <legend>Box</legend>
                {isDisposed(base) && <p>Gone · Reopen first before packing.</p>}
                <BoxSelect boxes={boxes} label="Packing box" value={box} onChange={setBox} />
                <button
                  className="secondary-button"
                  onClick={() => void save({ kind: 'pack', boxId: box || null }, 'Packing saved')}
                >
                  Pack / unpack
                </button>
              </fieldset>
              <fieldset disabled={busy || pending}>
                <legend>Moving outcome</legend>
                <label>
                  Moving decision
                  <select
                    value={decision}
                    onChange={(event) => setDecision(event.target.value as Item['decision'])}
                  >
                    {DECISIONS.map((value) => (
                      <option key={value} value={value}>
                        {value.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="secondary-button" onClick={() => changeDecision(decision)}>
                  Save decision
                </button>
                <label>
                  Moving progress
                  <select
                    value={progress}
                    onChange={(event) => setProgress(event.target.value as Item['progress'])}
                  >
                    {PROGRESS.map((value) => (
                      <option
                        key={value}
                        value={value}
                        disabled={base.decision === 'undecided' && value !== 'not_started'}
                      >
                        {value.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="secondary-button" onClick={() => changeProgress(progress)}>
                  Save progress
                </button>
                {base.completedAt && (
                  <p className="supporting">
                    Completed {base.completedAt.toDate().toLocaleString()}
                  </p>
                )}
              </fieldset>
            </>
          )}
          <button
            className="text-button"
            disabled={busy || pending}
            onClick={() =>
              request(
                { kind: 'trash' },
                'Move this item to trash? Its details and photos remain recoverable.',
                'Confirm move to trash',
              )
            }
          >
            Move to trash
          </button>
        </>
      )}
      {confirmation && (
        <div className="confirmation" role="group" aria-label="Confirm item change">
          <p>{confirmation.message}</p>
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => void save(confirmation.command, 'Change saved')}
          >
            {confirmation.label}
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              resetControls(base);
              setConfirmation(undefined);
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
