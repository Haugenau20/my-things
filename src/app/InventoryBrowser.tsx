import { useRef, useState } from 'react';
import type { FirebaseServices } from '../data/firebase';
import type { Item, Room } from '../domain/item';
import {
  DEFAULT_FILTERS,
  DECISIONS,
  PROGRESS,
  filterItems,
  formatMoney,
  isDisposed,
} from '../domain/organize';
import type { Box, Filters } from '../domain/organize';
import type { PhotoSession } from '../media/photo-session';
import { PrivatePhoto } from './PrivatePhoto';
import { PhotoAttachment } from './PhotoAttachment';
import { ItemEditor } from './ItemEditor';
import { BulkEditor } from './BulkEditor';

export function InventoryBrowser({
  items,
  workspaceView,
  rooms,
  boxes,
  services,
  inventoryId,
  session,
  signal,
  activeAttempt,
  setActiveAttempt,
  reload,
  defaultCurrency,
  metadataReady,
  browseLocation,
  setDefaultCurrency,
  requestDeletion,
}: {
  items: Item[];
  workspaceView: 'things' | 'review' | 'trash';
  rooms: Room[];
  boxes: Box[];
  services: FirebaseServices;
  inventoryId: string;
  session: PhotoSession;
  signal: AbortSignal;
  activeAttempt: string | undefined;
  setActiveAttempt: (id: string | undefined) => void;
  reload: () => Promise<void>;
  defaultCurrency: string | null;
  metadataReady: boolean;
  browseLocation: string | undefined;
  setDefaultCurrency: (currency: string) => Promise<void>;
  requestDeletion: (item: Item) => void;
}) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [grid, setGrid] = useState(true);
  const [selected, setSelected] = useState<string>();
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState('');
  const [lastBrowse, setLastBrowse] = useState(browseLocation);
  const scroll = useRef(0);
  const [lastView, setLastView] = useState(workspaceView);
  if (lastView !== workspaceView) {
    setLastView(workspaceView);
    setFilters((current) => ({
      ...current,
      trash: workspaceView === 'trash',
      reviewStatus: workspaceView === 'review' ? 'needs_review' : '',
      ...(workspaceView === 'trash' ? { box: '' } : {}),
    }));
    setSelected(undefined);
    setSelection(new Set());
  }
  // A location navigation request resets scope/filter choices, but ordinary reloads do not.
  if (browseLocation !== lastBrowse) {
    setLastBrowse(browseLocation);
    const [facet, id] = (browseLocation ?? '').split(':');
    setFilters({
      ...DEFAULT_FILTERS,
      ...(facet === 'room' ? { room: id ?? '' } : { box: id ?? '' }),
    });
    setSelection(new Set());
    setSelected(undefined);
    setGrid(true);
  }
  const visible = filterItems(items, filters).sort(
    (a, b) => b.createdAt.toMillis() - a.createdAt.toMillis() || a.id.localeCompare(b.id),
  );
  const detail = items.find((item) => item.id === selected && item.recordState === 'ready');
  const roomName = (id: string | null) =>
    id
      ? (() => {
          const room = rooms.find((room) => room.id === id);
          return room ? room.name + (room.archivedAt ? ' (archived)' : '') : 'Unavailable room';
        })()
      : 'No room';
  const boxName = (item: Item) =>
    isDisposed(item)
      ? 'Gone'
      : item.boxId
        ? (boxes.find((box) => box.id === item.boxId)?.label ?? 'Unavailable box')
        : 'Not packed';
  const locationName = (item: Item) => roomName(item.roomId) + ' · ' + boxName(item);
  function filter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setSelection(new Set());
  }
  function toggle(id: string, checked: boolean) {
    setSelection((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function open(id: string) {
    scroll.current = window.scrollY;
    setSelected(id);
    setAnnouncement('');
  }
  function back() {
    if (activeAttempt === selected) setActiveAttempt(undefined);
    setSelected(undefined);
    requestAnimationFrame(() => window.scrollTo({ top: scroll.current }));
  }
  const label = (value: string) => value.replaceAll('_', ' ');
  return (
    <section className="gallery-panel" aria-label="Saved inventory">
      {announcement && <p role="status">{announcement}</p>}
      {detail ? (
        <>
          <button className="text-button" onClick={back}>
            Back to gallery
          </button>
          <h2>{detail.name}</h2>
          <p>
            {locationName(detail)} ·{' '}
            {detail.reviewStatus === 'reviewed' ? 'Reviewed' : 'Needs review'} ·{' '}
            {label(detail.decision)} / {label(detail.progress)}
            {isDisposed(detail) ? ' · Gone' : ''}
            {detail.deletedAt ? ' · Trash' : ''}
          </p>
          <p className="supporting">
            Room: {roomName(detail.roomId)} · Quantity: {detail.quantity}
          </p>
          <div className="item-detail-layout">
            <div className="item-detail-media">
              <div className="detail-photos">
                {!detail.photos.some((photo) => photo.state === 'ready') && (
                  <p className="photo-placeholder">No photo yet</p>
                )}
                {detail.photos
                  .filter((photo) => photo.state === 'ready')
                  .map((photo, index) => (
                    <PrivatePhoto
                      key={photo.id}
                      file={photo.detail}
                      session={session}
                      detail
                      alt={`${detail.name} · photo ${index + 1}`}
                    />
                  ))}
              </div>
              {detail.deletedAt === null &&
                (detail.photos.length === 0 || activeAttempt === detail.id) && (
                  <PhotoAttachment
                    key={`photos-${detail.id}`}
                    item={detail}
                    services={services}
                    inventoryId={inventoryId}
                    signal={signal}
                    onSaved={async () => {
                      setActiveAttempt(undefined);
                      await reload();
                    }}
                    onAttempt={async (id) => {
                      setActiveAttempt(id);
                      await reload();
                    }}
                  />
                )}
            </div>
            <ItemEditor
              key={`editor-${detail.id}`}
              item={detail}
              rooms={rooms}
              boxes={boxes}
              services={services}
              inventoryId={inventoryId}
              defaultCurrency={defaultCurrency}
              setDefaultCurrency={setDefaultCurrency}
              requestDeletion={requestDeletion}
              signal={signal}
              reload={reload}
              next={() => {
                const pending = items
                  .filter(
                    (item) =>
                      item.recordState === 'ready' &&
                      item.deletedAt === null &&
                      !isDisposed(item) &&
                      item.reviewStatus === 'needs_review' &&
                      item.id !== detail.id,
                  )
                  .sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
                if (pending[0]) setSelected(pending[0].id);
                else {
                  back();
                  setAnnouncement('No other items need review.');
                }
              }}
            />
          </div>
        </>
      ) : (
        <>
          <div className="gallery-heading">
            <h2>Your things</h2>
            <span>
              {visible.length} entries{metadataReady ? '' : ' · refreshing metadata'}
            </span>
          </div>
          {!metadataReady && (
            <p role="status">
              Loading the complete metadata index. Search and bulk actions are unavailable until
              every page is loaded successfully.
            </p>
          )}
          <fieldset className="browse-filters" disabled={!metadataReady}>
            <legend>Browse and filter</legend>
            <label>
              Search all items
              <input
                type="search"
                value={filters.search}
                placeholder="Name, serial, notes or category"
                onChange={(event) => filter('search', event.target.value)}
              />
            </label>
            <div className="filter-fields">
              <label>
                Trash scope
                <input
                  type="checkbox"
                  checked={filters.trash}
                  onChange={(event) => filter('trash', event.target.checked)}
                />
              </label>
              <label>
                Room filter
                <select
                  value={filters.room}
                  onChange={(event) => filter('room', event.target.value)}
                >
                  <option value="">All rooms</option>
                  <option value="none">No room</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                      {room.archivedAt ? ' (archived)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Box filter
                <select value={filters.box} onChange={(event) => filter('box', event.target.value)}>
                  <option value="">All · still owned</option>
                  <option value="unpacked">Not packed</option>
                  {boxes.map((box) => (
                    <option key={box.id} value={box.id}>
                      {box.label}
                      {box.archivedAt ? ' (archived)' : ''}
                    </option>
                  ))}
                  <option value="gone">Gone</option>
                </select>
              </label>
              <label>
                Decision filter
                <select
                  value={filters.decision}
                  onChange={(event) => filter('decision', event.target.value)}
                >
                  <option value="">Any decision</option>
                  {DECISIONS.map((value) => (
                    <option key={value} value={value}>
                      {label(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Progress filter
                <select
                  value={filters.progress}
                  onChange={(event) => filter('progress', event.target.value)}
                >
                  <option value="">Any progress</option>
                  {PROGRESS.map((value) => (
                    <option key={value} value={value}>
                      {label(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Review filter
                <select
                  value={filters.reviewStatus}
                  onChange={(event) => filter('reviewStatus', event.target.value)}
                >
                  <option value="">Any review status</option>
                  <option value="needs_review">Needs review</option>
                  <option value="reviewed">Reviewed</option>
                </select>
              </label>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={filters.missingPhotos}
                onChange={(event) => filter('missingPhotos', event.target.checked)}
              />
              Missing photos
            </label>
            <button
              className="text-button"
              onClick={() => {
                setFilters(DEFAULT_FILTERS);
                setSelection(new Set());
              }}
            >
              Clear filters
            </button>
          </fieldset>
          <div className="browse-toolbar">
            <button className="secondary-button" aria-pressed={grid} onClick={() => setGrid(true)}>
              Grid
            </button>
            <button
              className="secondary-button"
              aria-pressed={!grid}
              onClick={() => setGrid(false)}
            >
              Table
            </button>
            <button
              className="text-button"
              disabled={!metadataReady || !visible.length}
              onClick={() => setSelection(new Set(visible.map((item) => item.id)))}
            >
              Select {visible.length} filtered entries
            </button>
            <button className="text-button" onClick={() => setSelection(new Set())}>
              Clear selection
            </button>
          </div>
          <BulkEditor
            items={metadataReady ? visible.filter((item) => selection.has(item.id)) : []}
            rooms={rooms}
            boxes={boxes}
            services={services}
            inventoryId={inventoryId}
            signal={signal}
            finished={async (results) => {
              setSelection(
                new Set(
                  results.filter((result) => result.status !== 'saved').map((result) => result.id),
                ),
              );
              await reload();
            }}
          />
          {!visible.length && (
            <div className="empty-gallery">
              <span aria-hidden="true">◌</span>
              <h3>
                {items.length ? 'No things match these filters.' : 'A little space to get started.'}
              </h3>
              <p>Your saved things will appear here.</p>
            </div>
          )}
          {grid ? (
            <div className="gallery-grid">
              {visible.map((item) => {
                const cover = item.photos.find(
                  (photo) => photo.id === item.coverPhotoId && photo.state === 'ready',
                );
                return (
                  <article key={item.id} className="item-card">
                    {cover ? (
                      <PrivatePhoto file={cover.thumbnail} session={session} alt={item.name} />
                    ) : (
                      <div className="private-photo thumbnail">
                        <span className="photo-placeholder">No photo yet</span>
                      </div>
                    )}
                    <label className="card-select checkbox-label">
                      <input
                        type="checkbox"
                        aria-label={`Select ${item.name}`}
                        disabled={!metadataReady}
                        checked={selection.has(item.id)}
                        onChange={(event) => toggle(item.id, event.target.checked)}
                      />
                      Select
                    </label>
                    <button
                      className="item-card-name"
                      aria-label={`Open ${item.name}`}
                      onClick={() => open(item.id)}
                    >
                      {item.name}
                    </button>
                    <span className="item-card-meta">
                      {locationName(item)} ·{' '}
                      {item.reviewStatus === 'reviewed' ? 'Reviewed' : 'Needs review'}
                      <br />
                      {label(item.decision)} / {label(item.progress)} · Quantity {item.quantity}
                    </span>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="table-scroll">
              <table className="inventory-table">
                <caption>
                  Filtered inventory · values are totals per entry, currencies remain separate
                </caption>
                <thead>
                  <tr>
                    {[
                      'Select',
                      'Name',
                      'Room',
                      'Box',
                      'Quantity',
                      'Value',
                      'Serial',
                      'Category',
                      'Review',
                      'Decision / progress',
                    ].map((title) => (
                      <th scope="col" key={title}>
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${item.name}`}
                          disabled={!metadataReady}
                          checked={selection.has(item.id)}
                          onChange={(event) => toggle(item.id, event.target.checked)}
                        />
                      </td>
                      <td>
                        <button
                          className="text-button"
                          aria-label={`Open ${item.name}`}
                          onClick={() => open(item.id)}
                        >
                          {item.name}
                        </button>
                      </td>
                      <td>{roomName(item.roomId)}</td>
                      <td>{boxName(item)}</td>
                      <td>{item.quantity}</td>
                      <td>{formatMoney(item.estimatedValue)}</td>
                      <td>{item.serialNumber ?? '—'}</td>
                      <td>{item.category ?? '—'}</td>
                      <td>{label(item.reviewStatus)}</td>
                      <td>
                        {label(item.decision)} / {label(item.progress)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
