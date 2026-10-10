import { useRef, useState } from 'react';
import type { FirebaseServices } from '../data/firebase';
import type { Item, Room } from '../domain/item';
import { DEFAULT_FILTERS, filterItems, formatMoney, isDisposed } from '../domain/organize';
import type { Box, Filters } from '../domain/organize';
import type { PhotoSession } from '../media/photo-session';
import { PrivatePhoto } from './PrivatePhoto';
import { PhotoAttachment } from './PhotoAttachment';
import { ItemEditor } from './ItemEditor';
import { BulkEditor } from './BulkEditor';
import { BrowseFilters } from './BrowseFilters';
import { defaultGrouping, selectionTitle, groupVisibleItems } from '../domain/browse';
import type { Grouping } from '../domain/browse';
import { ItemCard } from './ItemCard';
import { GroupActions } from './GroupActions';
import type { ItemGroup } from '../domain/browse';
import { bulkEdit, createBox } from '../data/organize-repository';
import type { BulkResult } from '../data/organize-repository';
import { useMutationState } from './mutation-activity';

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
  const [groupingChoice, setGroupingChoice] = useState<Grouping>();
  const grouping = groupingChoice ?? defaultGrouping(filters);
  const [selected, setSelected] = useState<string>();
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState('');
  const [groupBusy, setGroupBusy] = useMutationState();
  const [groupResults, setGroupResults] = useState<BulkResult[]>([]);
  const [groupError, setGroupError] = useState('');
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
  const groups = groupVisibleItems(visible, grouping, rooms, boxes);
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
  async function packGroup(
    group: ItemGroup,
    destination: { boxId: string } | { newLabel: string },
  ) {
    setGroupBusy(true);
    setGroupError('');
    setGroupResults([]);
    try {
      signal.throwIfAborted();
      const boxId =
        'boxId' in destination
          ? destination.boxId
          : (
              await createBox(
                services.db,
                inventoryId,
                destination.newLabel,
                Math.min(100000, boxes.length),
              )
            ).id;
      signal.throwIfAborted();
      const results = await bulkEdit(
        services.db,
        inventoryId,
        group.items,
        { kind: 'pack', boxId },
        signal,
      );
      if (!signal.aborted) {
        setGroupResults(results);
        setSelection(
          new Set(results.filter((result) => result.status !== 'saved').map((result) => result.id)),
        );
        await reload();
      }
    } catch {
      if (!signal.aborted) {
        setGroupError(
          'Could not finish group packing. Refresh before retrying; any created box is retained.',
        );
        setSelection(new Set(group.items.map((item) => item.id)));
        await reload();
      }
    } finally {
      if (!signal.aborted) setGroupBusy(false);
    }
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
          {!metadataReady && (
            <p role="status">
              Loading the complete metadata index. Search and bulk actions are unavailable until
              every page is loaded successfully.
            </p>
          )}
          <BrowseFilters
            items={items}
            rooms={rooms}
            boxes={boxes}
            filters={filters}
            ready={metadataReady && !groupBusy}
            change={(patch) => {
              setFilters((current) => ({ ...current, ...patch }));
              setSelection(new Set());
            }}
            clear={() => {
              setFilters({
                ...DEFAULT_FILTERS,
                trash: workspaceView === 'trash',
                reviewStatus: workspaceView === 'review' ? 'needs_review' : '',
              });
              setSelection(new Set());
            }}
          />
          <div className="gallery-heading">
            <div className="gallery-title">
              <h2>{selectionTitle(filters, rooms, boxes)}</h2>
              <span>
                {visible.length} things in{' '}
                {new Set(visible.map((item) => item.roomId).filter(Boolean)).size} rooms
                {metadataReady ? '' : ' · refreshing metadata'}
              </span>
            </div>
            <div className="browse-toolbar">
              <label>
                Group by
                <select
                  aria-label="Group by"
                  value={grouping}
                  onChange={(event) => setGroupingChoice(event.target.value as Grouping)}
                >
                  <option value="room">Room</option>
                  <option value="box">Box</option>
                  <option value="none">None</option>
                </select>
              </label>
              <button
                className="secondary-button"
                aria-pressed={grid}
                onClick={() => setGrid(true)}
              >
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
          </div>
          <BulkEditor
            items={
              metadataReady && !groupBusy ? visible.filter((item) => selection.has(item.id)) : []
            }
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
          {groupBusy && <p role="status">Packing this visible group…</p>}
          {groupError && (
            <p role="alert" className="error-message">
              {groupError}
            </p>
          )}
          {!!groupResults.length && (
            <div className="group-results">
              <p role="status">
                {groupResults.filter((result) => result.status === 'saved').length} saved ·{' '}
                {groupResults.filter((result) => result.status !== 'saved').length} not saved
              </p>
              <ul className="bulk-results">
                {groupResults.map((result) => (
                  <li key={result.id}>
                    {result.name}: {result.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
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
            <div className="grouped-gallery">
              {groups.map((group) => (
                <section
                  className="item-group"
                  key={group.key}
                  aria-label={group.label || 'All things'}
                >
                  {grouping !== 'none' && (
                    <div className="group-heading">
                      <h3 className={group.room !== undefined ? 'room-tag' : 'box-tag'}>
                        {group.label}
                      </h3>
                      <span>{group.items.length} things</span>
                      <GroupActions
                        group={group}
                        boxes={boxes}
                        disabled={!metadataReady || groupBusy}
                        canPack={
                          !filters.trash &&
                          (group.box === 'unpacked' ||
                            (group.room !== undefined && filters.box === 'unpacked'))
                        }
                        select={() =>
                          setSelection(
                            (current) =>
                              new Set([...current, ...group.items.map((item) => item.id)]),
                          )
                        }
                        openBox={() => {
                          setFilters((current) => ({ ...current, box: group.box ?? '' }));
                          setSelection(new Set());
                        }}
                        pack={(destination) => packGroup(group, destination)}
                      />
                    </div>
                  )}
                  <div className="gallery-grid">
                    {group.items.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        rooms={rooms}
                        boxes={boxes}
                        grouping={grouping}
                        session={session}
                        checked={selection.has(item.id)}
                        selecting={selection.size > 0}
                        disabled={!metadataReady || groupBusy}
                        open={() => open(item.id)}
                        toggle={(checked) => toggle(item.id, checked)}
                      />
                    ))}
                  </div>
                </section>
              ))}
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
