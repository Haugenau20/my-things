import { useEffect, useRef, useState } from 'react';
import type { FirebaseServices } from '../data/firebase';
import type { Item, Room } from '../domain/item';
import { DEFAULT_FILTERS, filterItems, formatMoney, isDisposed } from '../domain/organize';
import type { Box, Filters } from '../domain/organize';
import type { PhotoSession } from '../media/photo-session';
import { ItemDetail } from './ItemDetail';
import { useNarrow } from './use-narrow';
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
import { clickSelection } from '../domain/selection';

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
  capturePanel,
  captureOpen,
  onInspect,
  inspectRequest,
  onRoomFilter,
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
  capturePanel: React.ReactNode;
  captureOpen: boolean;
  onInspect: () => void;
  inspectRequest: { sequence: number; id: string } | undefined;
  onRoomFilter: (room: string) => void;
}) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [grid, setGrid] = useState(true);
  const [groupingChoice, setGroupingChoice] = useState<Grouping>();
  const grouping = groupingChoice ?? defaultGrouping(filters);
  const [selected, setSelected] = useState<string>();
  const [fullView, setFullView] = useState(false);
  const narrow = useNarrow();
  useEffect(() => {
    onRoomFilter(filters.room);
  }, [filters.room, onRoomFilter]);
  useEffect(() => {
    if (inspectRequest) {
      setSelected(inspectRequest.id);
      setFullView(false);
    }
  }, [inspectRequest]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState('');
  const [groupBusy, setGroupBusy] = useMutationState();
  const [groupResults, setGroupResults] = useState<BulkResult[]>([]);
  const [groupError, setGroupError] = useState('');
  const [bulkHeight, setBulkHeight] = useState(0);
  const gallery = useRef<HTMLElement>(null);
  const selectionAnchor = useRef<string | undefined>(undefined);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        gallery.current &&
        gallery.current.offsetParent !== null
      ) {
        setSelection(new Set());
        selectionAnchor.current = undefined;
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
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
  const renderedGroups: ItemGroup[] = narrow
    ? [{ key: 'phone-items', label: '', items: visible }]
    : groups;
  useEffect(() => {
    selectionAnchor.current = undefined;
  }, [filters, workspaceView, browseLocation]);
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
  function toggle(id: string, checked: boolean, shift = false) {
    const order =
      grid && !narrow
        ? groups.flatMap((group) => group.items.map((item) => item.id))
        : visible.map((item) => item.id);
    const anchor = selectionAnchor.current;
    setSelection((current) => clickSelection(current, id, checked, anchor, order, shift));
    if (!shift || !order.includes(selectionAnchor.current ?? '')) selectionAnchor.current = id;
  }
  function open(id: string) {
    onInspect();
    scroll.current = window.scrollY;
    setSelected(id);
    setFullView(false);
    setAnnouncement('');
  }
  function back() {
    if (activeAttempt === selected) setActiveAttempt(undefined);
    setSelected(undefined);
    requestAnimationFrame(() => window.scrollTo({ top: scroll.current }));
  }
  function moveDetail(direction: number) {
    const index = visible.findIndex((item) => item.id === selected);
    const target =
      index < 0 ? visible[direction > 0 ? 0 : visible.length - 1] : visible[index + direction];
    if (target) setSelected(target.id);
  }
  function nextReview() {
    const pending = items
      .filter(
        (item) =>
          item.recordState === 'ready' &&
          item.deletedAt === null &&
          !isDisposed(item) &&
          item.reviewStatus === 'needs_review' &&
          item.id !== selected,
      )
      .sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
    if (pending[0]) setSelected(pending[0].id);
    else {
      back();
      setAnnouncement('No other items need review.');
    }
  }
  useEffect(() => {
    if (!detail || fullView || narrow) return;
    const key = (event: KeyboardEvent) => {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        gallery.current?.offsetParent === null ||
        (event.target instanceof Element &&
          event.target.closest('input,textarea,select,[contenteditable="true"]'))
      )
        return;
      const direction = ['j', 'ArrowRight', 'ArrowDown'].includes(event.key)
        ? 1
        : ['k', 'ArrowLeft', 'ArrowUp'].includes(event.key)
          ? -1
          : 0;
      if (direction) {
        event.preventDefault();
        moveDetail(direction);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
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
    <section
      ref={gallery}
      className={
        captureOpen && !narrow
          ? 'gallery-panel has-capture'
          : detail && !fullView && !narrow
            ? 'gallery-panel has-inspector'
            : 'gallery-panel'
      }
      aria-label="Saved inventory"
      style={{ paddingBottom: bulkHeight ? bulkHeight + (narrow ? 128 : 48) : undefined }}
    >
      {announcement && <p role="status">{announcement}</p>}
      {capturePanel}
      <div className="browse-column" hidden={!captureOpen && !!detail && (fullView || narrow)}>
        {!metadataReady && (
          <p role="status">
            Loading the complete metadata index. Search and bulk actions are unavailable until every
            page is loaded successfully.
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
            <h2>
              {narrow
                ? workspaceView === 'things'
                  ? 'Your things'
                  : workspaceView === 'review'
                    ? 'Review inbox'
                    : 'Trash'
                : selectionTitle(filters, rooms, boxes)}
            </h2>
            <span>
              {visible.length} things in{' '}
              {new Set(visible.map((item) => item.roomId).filter(Boolean)).size} rooms
              {narrow && (filters.room || filters.box)
                ? ' · ' + selectionTitle(filters, rooms, boxes)
                : ''}
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
          isTrash={filters.trash}
          filteredCount={visible.length}
          selectAll={() => setSelection(new Set(visible.map((item) => item.id)))}
          clear={() => {
            setSelection(new Set());
            selectionAnchor.current = undefined;
          }}
          reserve={setBulkHeight}
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
        {grid || narrow ? (
          <div className="grouped-gallery">
            {renderedGroups.map((group) => (
              <section
                className="item-group"
                key={group.key}
                aria-label={group.label || 'All things'}
              >
                {!narrow && grouping !== 'none' && (
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
                          (current) => new Set([...current, ...group.items.map((item) => item.id)]),
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
                      grouping={narrow ? (filters.room ? 'room' : 'box') : grouping}
                      session={session}
                      checked={selection.has(item.id)}
                      selecting={selection.size > 0}
                      inspected={selected === item.id}
                      disabled={!metadataReady || groupBusy}
                      open={() => open(item.id)}
                      toggle={(checked, shift) => toggle(item.id, checked, shift)}
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
                        onChange={(event) =>
                          toggle(
                            item.id,
                            event.target.checked,
                            event.nativeEvent instanceof MouseEvent && event.nativeEvent.shiftKey,
                          )
                        }
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
      </div>
      {detail && !captureOpen && (
        <ItemDetail
          item={detail}
          compact={!fullView && !narrow}
          visible={visible}
          rooms={rooms}
          boxes={boxes}
          services={services}
          inventoryId={inventoryId}
          session={session}
          signal={signal}
          activeAttempt={activeAttempt}
          setActiveAttempt={setActiveAttempt}
          reload={reload}
          defaultCurrency={defaultCurrency}
          setDefaultCurrency={setDefaultCurrency}
          requestDeletion={requestDeletion}
          close={back}
          fullView={() => setFullView(true)}
          move={moveDetail}
          nextReview={nextReview}
        />
      )}
    </section>
  );
}
