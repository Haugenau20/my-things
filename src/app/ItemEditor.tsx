import { useState } from 'react';
import type { FormEvent } from 'react';
import type { FirebaseServices } from '../data/firebase';
import type { Item, Room } from '../domain/item';
import {
  CURRENCIES,
  DECISIONS,
  PROGRESS,
  isDisposed,
  locationKey,
  moneyInput,
  parseMoney,
} from '../domain/organize';
import type { Box, ItemCommand, MetadataPatch } from '../domain/organize';
import { editItem } from '../data/organize-repository';
import { LocationSelect, selectedLocation } from './LocationSelect';

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
  rooms,
  boxes,
  services,
  inventoryId,
  defaultCurrency,
  signal,
  reload,
  next,
  setDefaultCurrency,
}: {
  item: Item;
  rooms: Room[];
  boxes: Box[];
  services: FirebaseServices;
  inventoryId: string;
  defaultCurrency: string | null;
  signal: AbortSignal;
  reload: () => Promise<void>;
  next: () => void;
  setDefaultCurrency: (currency: string) => Promise<void>;
}) {
  const [base, setBase] = useState(item);
  const [form, setForm] = useState(() => fields(item, defaultCurrency));
  const [location, setLocation] = useState(locationKey(item.currentLocation));
  const [original, setOriginal] = useState(item.originalRoomId ?? '');
  const [decision, setDecision] = useState(item.decision);
  const [progress, setProgress] = useState(item.progress);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<{
    command: ItemCommand;
    message: string;
    label: string;
  }>();
  const reset = (value: Item) => {
    setBase(value);
    setForm(fields(value, defaultCurrency));
    setLocation(locationKey(value.currentLocation));
    setOriginal(value.originalRoomId ?? '');
    setDecision(value.decision);
    setProgress(value.progress);
  };
  const pending = item.photos.some((photo) => photo.state !== 'ready');
  const changed = item.revision !== base.revision;
  async function save(command: ItemCommand, text: string) {
    setBusy(true);
    setError('');
    setMessage('');
    setConfirmation(undefined);
    try {
      const saved = await editItem(services.db, inventoryId, base, command, signal);
      if (!signal.aborted) {
        reset(saved);
        setMessage(text);
        await reload();
      }
    } catch (failure) {
      if (!signal.aborted)
        setError(
          failure instanceof Error && /changed elsewhere|Reactivate/.test(failure.message)
            ? failure.message
            : 'Could not save. Refresh to check the current record before retrying.',
        );
    } finally {
      if (!signal.aborted) setBusy(false);
    }
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
      void save({ kind: 'metadata', patch }, 'Details saved');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Check the entered details.');
    }
  }
  const update = (key: keyof typeof form, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const request = (command: ItemCommand, message: string, label: string) =>
    setConfirmation({ command, message, label });
  return (
    <section className="item-editor" aria-label="Edit item">
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
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() =>
            void save({ kind: 'restore' }, 'Restored; the previous moving outcome is preserved')
          }
        >
          Restore item
        </button>
      ) : (
        <>
          <form onSubmit={details}>
            <fieldset disabled={busy || pending}>
              <legend>Details</legend>
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
                Value is the total for all units in this entry. Blank means unknown; zero is a
                value. Use a dot for decimals. Saving details leaves review status unchanged.
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
          <fieldset disabled={busy || pending}>
            <legend>Review</legend>
            <p>{base.reviewStatus === 'reviewed' ? 'Reviewed' : 'Needs review'}</p>
            <div className="save-actions">
              <button
                className="secondary-button"
                onClick={() =>
                  void save({ kind: 'metadata', patch: { reviewStatus: 'reviewed' } }, 'Reviewed')
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
          <fieldset disabled={busy || pending || isDisposed(base)}>
            <legend>Current location</legend>
            {isDisposed(base) && (
              <p>Reopen this completed sale or donation before assigning a location.</p>
            )}
            <LocationSelect
              rooms={rooms}
              boxes={boxes}
              label="New current location"
              value={location}
              onChange={setLocation}
            />
            <button
              className="secondary-button"
              onClick={() =>
                void save({ kind: 'move', location: selectedLocation(location) }, 'Location saved')
              }
            >
              Move item
            </button>
          </fieldset>
          <details>
            <summary>Correct original room</summary>
            <fieldset disabled={busy || pending}>
              <label>
                Original room correction
                <select value={original} onChange={(event) => setOriginal(event.target.value)}>
                  <option value="">No original room</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                      {room.archivedAt ? ' (archived)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="secondary-button"
                onClick={() =>
                  request(
                    { kind: 'original', roomId: original || null },
                    'This explicitly corrects the first recorded room; current location stays as it is.',
                    'Confirm original room correction',
                  )
                }
              >
                Correct original room
              </button>
            </fieldset>
          </details>
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
            <button
              className="secondary-button"
              onClick={() =>
                decision !== base.decision && base.progress !== 'not_started'
                  ? request(
                      { kind: 'decision', decision },
                      'Changing this decision resets the current progress and completion time.',
                      'Confirm decision change',
                    )
                  : void save({ kind: 'decision', decision }, 'Decision saved')
              }
            >
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
            <button
              className="secondary-button"
              onClick={() =>
                progress === 'completed' &&
                ['sell', 'give_away'].includes(base.decision) &&
                base.progress !== 'completed'
                  ? request(
                      { kind: 'progress', progress },
                      'Completing this sale or donation removes the item from its current room or box and moves it to the completed archive. Photos and original room are retained.',
                      'Confirm completion',
                    )
                  : void save({ kind: 'progress', progress }, 'Progress saved')
              }
            >
              Save progress
            </button>
            {base.completedAt && (
              <p className="supporting">Completed {base.completedAt.toDate().toLocaleString()}</p>
            )}
          </fieldset>
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
            onClick={() => setConfirmation(undefined)}
          >
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
