import { useState } from 'react';
import type { Item, Room } from '../domain/item';
import { DECISIONS, PROGRESS } from '../domain/organize';
import type { Box, ItemCommand } from '../domain/organize';
import type { FirebaseServices } from '../data/firebase';
import { bulkEdit } from '../data/organize-repository';
import type { BulkResult } from '../data/organize-repository';
import { LocationSelect, selectedLocation } from './LocationSelect';

export function BulkEditor({
  items,
  rooms,
  boxes,
  services,
  inventoryId,
  signal,
  finished,
}: {
  items: Item[];
  rooms: Room[];
  boxes: Box[];
  services: FirebaseServices;
  inventoryId: string;
  signal: AbortSignal;
  finished: (results: BulkResult[]) => Promise<void>;
}) {
  const [action, setAction] = useState('review');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('unassigned');
  const [decision, setDecision] = useState<Item['decision']>('undecided');
  const [progress, setProgress] = useState<Item['progress']>('not_started');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [results, setResults] = useState<BulkResult[]>([]);
  const command: ItemCommand =
    action === 'review'
      ? { kind: 'metadata', patch: { reviewStatus: 'reviewed' } }
      : action === 'category'
        ? { kind: 'metadata', patch: { category: category || null } }
        : action === 'move'
          ? { kind: 'move', location: selectedLocation(location) }
          : action === 'decision'
            ? { kind: 'decision', decision }
            : action === 'progress'
              ? { kind: 'progress', progress }
              : action === 'restore'
                ? { kind: 'restore' }
                : { kind: 'trash' };
  const warning =
    command.kind === 'trash' ||
    (command.kind === 'decision' &&
      items.some((item) => item.decision !== decision && item.progress !== 'not_started')) ||
    (command.kind === 'progress' &&
      progress === 'completed' &&
      items.some((item) => ['sell', 'give_away'].includes(item.decision)));
  async function apply() {
    setBusy(true);
    setConfirm(false);
    setResults([]);
    try {
      const result = await bulkEdit(services.db, inventoryId, items, command, signal);
      if (!signal.aborted) {
        setResults(result);
        await finished(result);
      }
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="bulk-editor" aria-label="Bulk editing">
      <fieldset disabled={busy}>
        <legend>{items.length} selected</legend>
        <label>
          Bulk action
          <select
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setConfirm(false);
            }}
          >
            <option value="review">Mark reviewed</option>
            <option value="category">Set category</option>
            <option value="move">Change current location / pack</option>
            <option value="decision">Change decision</option>
            <option value="progress">Change progress</option>
            <option value="trash">Move to trash</option>
            <option value="restore">Restore from trash</option>
          </select>
        </label>
        {action === 'category' && (
          <label>
            Bulk category
            <input
              maxLength={100}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            />
          </label>
        )}
        {action === 'move' && (
          <LocationSelect
            rooms={rooms}
            boxes={boxes}
            label="Bulk current location"
            value={location}
            onChange={setLocation}
          />
        )}
        {action === 'decision' && (
          <label>
            Bulk decision
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
        )}
        {action === 'progress' && (
          <label>
            Bulk progress
            <select
              value={progress}
              onChange={(event) => setProgress(event.target.value as Item['progress'])}
            >
              {PROGRESS.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="supporting">
          Only this action's fields change. Each item is checked against its displayed revision.
          Failed items stay selected.
        </p>
        <button
          className="secondary-button"
          disabled={!items.length}
          onClick={() => (warning ? setConfirm(true) : void apply())}
        >
          Apply to {items.length} selected
        </button>
        {confirm && (
          <div className="confirmation">
            <p>
              This can reset moving progress, remove completed sales/donations from their locations,
              or move records to trash. Apply this action to {items.length} selected items?
            </p>
            <button className="primary-button" onClick={() => void apply()}>
              Confirm bulk change
            </button>
            <button className="text-button" onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </div>
        )}
      </fieldset>
      {busy && <p role="status">Saving selected items…</p>}
      {!!results.length && (
        <>
          <p role="status">
            {results.filter((result) => result.status === 'saved').length} saved ·{' '}
            {results.filter((result) => result.status !== 'saved').length} not saved
          </p>
          <ul className="bulk-results">
            {results.map((result) => (
              <li key={result.id}>
                {result.name}: {result.message}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
