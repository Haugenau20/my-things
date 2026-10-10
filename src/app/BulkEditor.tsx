import { useMutationState } from './mutation-activity';
import { useEffect, useRef, useState } from 'react';
import type { Item, Room } from '../domain/item';
import { DECISIONS, PROGRESS } from '../domain/organize';
import type { Box, ItemCommand } from '../domain/organize';
import type { FirebaseServices } from '../data/firebase';
import { bulkEdit } from '../data/organize-repository';
import type { BulkResult } from '../data/organize-repository';
import { RoomSelect, BoxSelect } from './LocationSelect';

export function BulkEditor({
  items,
  rooms,
  boxes,
  services,
  inventoryId,
  signal,
  finished,
  isTrash,
  filteredCount,
  selectAll,
  clear,
  reserve,
}: {
  items: Item[];
  isTrash: boolean;
  filteredCount: number;
  selectAll: () => void;
  clear: () => void;
  reserve: (height: number) => void;
  rooms: Room[];
  boxes: Box[];
  services: FirebaseServices;
  inventoryId: string;
  signal: AbortSignal;
  finished: (results: BulkResult[]) => Promise<void>;
}) {
  const [action, setAction] = useState<string>();
  const [category, setCategory] = useState('');
  const [room, setRoom] = useState('');
  const [box, setBox] = useState('');
  const [decision, setDecision] = useState<Item['decision']>('undecided');
  const [progress, setProgress] = useState<Item['progress']>('not_started');
  const [busy, setBusy] = useMutationState();
  const [confirm, setConfirm] = useState(false);
  const [results, setResults] = useState<BulkResult[]>([]);
  const [error, setError] = useState('');
  const bar = useRef<HTMLElement>(null);
  const showBar = items.length > 0 || busy;
  useEffect(() => {
    if (!bar.current) {
      reserve(0);
      setAction(undefined);
      return;
    }
    const element = bar.current;
    const update = () => reserve(element.getBoundingClientRect().height);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, [showBar, reserve]);
  const command: ItemCommand =
    action === 'review'
      ? { kind: 'metadata', patch: { reviewStatus: 'reviewed' } }
      : action === 'category'
        ? { kind: 'metadata', patch: { category: category || null } }
        : action === 'room'
          ? { kind: 'setRoom', roomId: room || null }
          : action === 'pack'
            ? { kind: 'pack', boxId: box || null }
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
    setError('');
    try {
      const result = await bulkEdit(services.db, inventoryId, items, command, signal);
      if (!signal.aborted) {
        setResults(result);
        await finished(result);
      }
    } catch {
      if (!signal.aborted)
        setError('Could not apply this action. Check its input and refresh before retrying.');
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  const resultContent = !!results.length && (
    <>
      <p role="status">
        {results.filter((result) => result.status === 'saved').length} saved ·{' '}
        {results.filter((result) => result.status !== 'saved').length} not saved
      </p>
      <details className="bulk-result-details">
        <summary>Per-item results</summary>
        <ul className="bulk-results">
          {results.map((result) => (
            <li key={result.id}>
              {result.name}: {result.message}
            </li>
          ))}
        </ul>
      </details>
      <button className="text-button" onClick={() => setResults([])}>
        Dismiss results
      </button>
    </>
  );
  return (
    <>
      {showBar && (
        <section ref={bar} className="bulk-editor contextual-bulk" aria-label="Bulk editing">
          <fieldset disabled={busy} className="bulk-controls">
            <strong>{items.length} selected</strong>
            <div className="bulk-action-buttons">
              {(isTrash
                ? [['restore', 'Restore']]
                : [
                    ['review', 'Mark reviewed'],
                    ['room', 'Set room'],
                    ['pack', 'Pack / unpack'],
                    ['decision', 'Decision'],
                    ['progress', 'Progress'],
                    ['category', 'Category'],
                    ['trash', 'Trash'],
                  ]
              ).map(([value, label]) => (
                <button
                  key={value}
                  className="text-button"
                  aria-expanded={action === value}
                  onClick={() => {
                    setAction(action === value ? undefined : value);
                    setConfirm(false);
                    setError('');
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="bulk-selection-buttons">
              <button className="text-button" onClick={selectAll}>
                Select all {filteredCount} filtered
              </button>
              <button className="text-button" onClick={clear}>
                Clear
              </button>
            </div>
            {action && (
              <div className="bulk-popover">
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
                {action === 'room' && (
                  <RoomSelect rooms={rooms} label="Bulk room" value={room} onChange={setRoom} />
                )}
                {action === 'pack' && (
                  <BoxSelect boxes={boxes} label="Bulk box" value={box} onChange={setBox} />
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
                      This can reset moving progress, mark completed sales/donations Gone, or move
                      things to Trash. Apply to {items.length} selected things?
                    </p>
                    <button className="primary-button" onClick={() => void apply()}>
                      Confirm bulk change
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
              </div>
            )}
          </fieldset>
          {busy && <p role="status">Saving selected items…</p>}
          {resultContent}
        </section>
      )}
      {!showBar && resultContent && <div className="bulk-toast">{resultContent}</div>}
    </>
  );
}
