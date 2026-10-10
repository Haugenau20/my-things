import { useCallback, useEffect, useRef, useState } from 'react';
import type { FirebaseServices } from '../data/firebase';
import type { Inventory } from '../domain/inventory';
import type { Item, Room } from '../domain/item';
import type { Box } from '../domain/organize';
import { DEFAULT_FILTERS, filterItems } from '../domain/organize';

const VIEWS = ['things', 'review', 'overview', 'locations', 'trash', 'settings'] as const;
type View = (typeof VIEWS)[number];
function hashView(): View {
  return VIEWS.find((view) => window.location.hash === '#' + view) ?? 'things';
}
import { loadItems, loadRooms } from '../data/capture-repository';
import { loadBoxes } from '../data/organize-repository';
import { loadInventory, updateSettings } from '../data/inventory-repository';
import { PhotoSession } from '../media/photo-session';
import { CaptureForm } from './CaptureForm';
import { RecoveryPanel } from './RecoveryPanel';
import { InventoryBrowser } from './InventoryBrowser';
import { LocationManager } from './LocationManager';
import { InventorySettings } from './InventorySettings';
import { DeletionDialog, DeletionRecovery } from './DeletionDialog';
import { OrphanInspection } from './OrphanInspection';
import { ExportPanel } from './ExportPanel';
import { MutationActivity } from './mutation-activity';
import { RestorePanel } from './RestorePanel';
import { loadRestoreReport } from '../backup/restore-repository';
import type { RestoreReport } from '../backup/restore-state';
import type { Environment } from '../data/config';
import { useNarrow } from './use-narrow';
import { BottomSheet } from './BottomSheet';
import { PhoneCapture } from './PhoneCapture';
import { Overview } from './Overview';
import type { BrowseRequest } from '../domain/overview';

export function InventoryWorkspace({
  services,
  inventoryId,
  inventory,
  environment,
  signOut,
  signOutPending,
}: {
  services: FirebaseServices;
  inventoryId: string;
  inventory: Inventory;
  environment: Environment;
  signOut: () => Promise<void>;
  signOutPending: boolean;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [settings, setSettings] = useState(inventory);
  const [exportBusy, setExportBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restore, setRestore] = useState<RestoreReport | null>(null);
  const [mutating, setMutating] = useState(0);
  const mutations = useRef(new Set<symbol>());
  const reportMutation = useCallback((id: symbol, busy: boolean) => {
    if (busy) mutations.current.add(id);
    else mutations.current.delete(id);
    setMutating(mutations.current.size);
  }, []);
  const [activeAttempt, setActiveAttempt] = useState<string>();
  const [deletionRequested, setDeletionRequested] = useState<Item>();
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<View>(hashView);
  const [browserView, setBrowserView] = useState<'things' | 'review' | 'trash'>('things');
  const [captureOpen, setCaptureOpen] = useState(false);
  const narrow = useNarrow();
  const [moreOpen, setMoreOpen] = useState(false);
  const [captureRoom, setCaptureRoom] = useState('');
  const [captureRequest, setCaptureRequest] = useState({ sequence: 0, room: 'sticky' });
  const [inspectRequest, setInspectRequest] = useState<{ sequence: number; id: string }>();
  const captureContainer = useRef<HTMLDivElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [browseLocation, setBrowseLocation] = useState<BrowseRequest>();
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(true);
  const [session] = useState(() => new PhotoSession(services.storage));
  const [controller] = useState(() => new AbortController());
  const version = useRef(0);
  const reload = useCallback(async () => {
    const request = ++version.current;
    setRefreshing(true);
    try {
      const [nextItems, nextRooms, nextBoxes, nextSettings, nextRestore] = await Promise.all([
        loadItems(services.db, inventoryId),
        loadRooms(services.db, inventoryId),
        loadBoxes(services.db, inventoryId),
        loadInventory(services.db, inventoryId, inventory.ownerUid),
        loadRestoreReport(services.db, inventoryId),
      ]);
      if (!controller.signal.aborted && version.current === request) {
        setItems(nextItems);
        setRooms(nextRooms);
        setBoxes(nextBoxes);
        setSettings(nextSettings);
        setRestore(nextRestore);
        setError(false);
      }
    } catch {
      if (!controller.signal.aborted && version.current === request) setError(true);
    } finally {
      if (!controller.signal.aborted && version.current === request) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [services, inventoryId, inventory.ownerUid, controller]);
  useEffect(() => {
    void reload();
    return () => {
      ++version.current;
      controller.abort();
      session.dispose();
    };
  }, [reload, controller, session]);
  const ordinaryLocked = exportBusy || restoreBusy || (!!restore && restore.state !== 'completed');
  const busy = exportBusy || restoreBusy;
  const navigate = useCallback((next: View) => {
    setView(next);
    if (next === 'things' || next === 'review' || next === 'trash') setBrowserView(next);
    if (window.location.hash !== '#' + next) window.location.hash = next;
  }, []);
  useEffect(() => {
    const changed = () => {
      const next = hashView();
      setView(next);
      if (next === 'things' || next === 'review' || next === 'trash') setBrowserView(next);
    };
    changed();
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  const add = useCallback(() => {
    if (ordinaryLocked || loading || error) return;
    navigate('things');
    setCaptureOpen(true);
    setCaptureRequest((current) => ({
      sequence: current.sequence + 1,
      room: captureRoom || 'sticky',
    }));
    requestAnimationFrame(() =>
      captureContainer.current
        ?.querySelector<HTMLInputElement>('input[aria-label="Item name"]')
        ?.focus(),
    );
  }, [navigate, ordinaryLocked, loading, error, captureRoom]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== 'n' ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (event.target instanceof Element &&
          event.target.closest('input,textarea,select,[contenteditable="true"]'))
      )
        return;
      event.preventDefault();
      add();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [add]);
  const owned = filterItems(items, DEFAULT_FILTERS);
  const reviewCount = owned.filter((item) => item.reviewStatus === 'needs_review').length;
  const titles: Record<View, string> = {
    things: 'Things',
    review: 'Review inbox',
    overview: 'Where everything is',
    locations: 'Manage rooms & boxes',
    trash: 'Trash',
    settings: 'Backup & settings',
  };
  return (
    <MutationActivity.Provider value={reportMutation}>
      <main className="workspace app-workspace">
        <aside className="workspace-sidebar">
          <a className="wordmark" href="#things" aria-label="My things home">
            <span className="brand-mark" aria-hidden="true">
              m.
            </span>
            my things
          </a>
          <button
            className="secondary-button add-thing"
            disabled={ordinaryLocked || loading || error}
            onClick={add}
          >
            + Add a thing <kbd>N</kbd>
          </button>
          <fieldset disabled={busy}>
            <nav aria-label="Inventory views">
              {VIEWS.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-current={view === key ? 'page' : undefined}
                  onClick={() => navigate(key)}
                >
                  {titles[key]}
                  {key === 'things' && <span>{owned.length}</span>}
                  {key === 'review' && <span className="review-count">{reviewCount}</span>}
                </button>
              ))}
            </nav>
          </fieldset>
          <div className="sidebar-footer">
            <span>✓ Owner verified</span>
            <button
              className="text-button"
              disabled={signOutPending}
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
        </aside>
        <div className="workspace-main">
          <div className="workspace-toolbar">
            {!['things', 'review', 'trash', 'overview'].includes(view) && <h1>{titles[view]}</h1>}
            <button className="text-button" disabled={busy} onClick={() => void reload()}>
              Refresh inventory
            </button>
          </div>
          {environment === 'local' && <p className="supporting">Local preview · synthetic data</p>}
          {restore && restore.state !== 'completed' && (
            <p role="alert" className="error-message">
              An import is unfinished ({restore.completedRecords} records verified). Ordinary
              changes and full export are paused. Open Restore backup and select every part of the
              original archive to resume.
              <button className="text-button" disabled={busy} onClick={() => navigate('settings')}>
                Open Restore backup
              </button>
              <button
                className="text-button"
                disabled={busy || refreshing}
                onClick={() => void reload()}
              >
                Refresh recovery report
              </button>
            </p>
          )}
          {error && (
            <p role="alert" className="error-message">
              Could not refresh inventory. Records may be out of date or invalid. Check your
              connection and refresh before continuing.
            </p>
          )}
          {notice && (
            <p role="status" className="save-status">
              {notice}
            </p>
          )}
          <div hidden={view !== 'settings'}>
            <details className="inventory-settings">
              <summary>Backup export</summary>
              <ExportPanel
                services={services}
                inventoryId={inventoryId}
                signal={controller.signal}
                disabled={
                  loading ||
                  refreshing ||
                  error ||
                  mutating > 0 ||
                  !!deletionRequested ||
                  restoreBusy ||
                  (!!restore && restore.state !== 'completed')
                }
                pause={setExportBusy}
              />
            </details>
            <details className="inventory-settings">
              <summary>Restore backup</summary>
              <RestorePanel
                services={services}
                inventoryId={inventoryId}
                environment={environment}
                signal={controller.signal}
                disabled={
                  loading ||
                  refreshing ||
                  error ||
                  mutating > 0 ||
                  !!deletionRequested ||
                  exportBusy
                }
                pause={setRestoreBusy}
                reload={reload}
                session={session}
              />
            </details>

            <fieldset disabled={ordinaryLocked} inert={ordinaryLocked}>
              {' '}
              <details
                className="inventory-settings"
                onToggle={(event) => setSettingsOpen(event.currentTarget.open)}
              >
                <summary>Inventory settings</summary>
                {settingsOpen && (
                  <InventorySettings
                    inventory={settings}
                    services={services}
                    inventoryId={inventoryId}
                    reload={reload}
                  />
                )}
              </details>
              <details className="inventory-settings">
                <summary>Photo maintenance</summary>
                <OrphanInspection
                  services={services}
                  inventoryId={inventoryId}
                  signal={controller.signal}
                />
              </details>
            </fieldset>
          </div>
          <fieldset className="inventory-actions" disabled={ordinaryLocked} inert={ordinaryLocked}>
            {deletionRequested && (
              <DeletionDialog
                item={deletionRequested}
                services={services}
                inventoryId={inventoryId}
                signal={controller.signal}
                reload={reload}
                closed={() => {
                  setDeletionRequested(undefined);
                  void reload();
                }}
                completed={async () => {
                  setNotice(`Permanently deleted ${deletionRequested.name}.`);
                  setDeletionRequested(undefined);
                  await reload();
                }}
              />
            )}

            {loading ? (
              <p role="status">Loading saved items and rooms…</p>
            ) : (
              <>
                <div hidden={view !== 'things'}>
                  {' '}
                  <RecoveryPanel
                    items={items.filter(
                      (item) =>
                        !(restore && restore.state !== 'completed') &&
                        item.id !== activeAttempt &&
                        item.deletedAt === null &&
                        ((item.recordState !== 'ready' && item.coverPhotoId === null) ||
                          (item.recordState === 'ready' &&
                            item.photos.some((photo) => photo.state !== 'ready'))),
                    )}
                    services={services}
                    inventoryId={inventoryId}
                    signal={controller.signal}
                    reload={reload}
                  />
                  <DeletionRecovery
                    items={items.filter(
                      (item) => item.recordState === 'deleting' && item.deletedAt !== null,
                    )}
                    open={setDeletionRequested}
                  />
                </div>
                {view === 'locations' && (
                  <LocationManager
                    rooms={rooms}
                    boxes={boxes}
                    items={items}
                    services={services}
                    inventoryId={inventoryId}
                    reload={reload}
                    browse={(key) => {
                      const [facet, id] = key.split(':');
                      setBrowseLocation((current) => ({
                        sequence: (current?.sequence ?? 0) + 1,
                        room: facet === 'room' ? (id ?? '') : '',
                        box: facet === 'box' ? (id ?? '') : '',
                      }));
                      navigate('things');
                    }}
                  />
                )}
                {view === 'overview' && (
                  <Overview
                    items={items}
                    rooms={rooms}
                    boxes={boxes}
                    browse={(room, box) => {
                      setBrowseLocation((current) => ({
                        sequence: (current?.sequence ?? 0) + 1,
                        room,
                        box,
                      }));
                      navigate('things');
                    }}
                  />
                )}
                <div hidden={!['things', 'review', 'trash'].includes(view)}>
                  {' '}
                  <InventoryBrowser
                    items={items}
                    workspaceView={browserView}
                    rooms={rooms}
                    boxes={boxes}
                    services={services}
                    inventoryId={inventoryId}
                    session={session}
                    signal={controller.signal}
                    activeAttempt={activeAttempt}
                    setActiveAttempt={setActiveAttempt}
                    reload={reload}
                    defaultCurrency={settings.defaultCurrency}
                    metadataReady={!refreshing && !error}
                    browseLocation={browseLocation}
                    setDefaultCurrency={async (currency) => {
                      await updateSettings(services.db, inventoryId, settings, {
                        defaultCurrency: currency,
                      });
                      await reload();
                    }}
                    captureOpen={captureOpen && view === 'things'}
                    onInspect={() => setCaptureOpen(false)}
                    inspectRequest={inspectRequest}
                    onRoomFilter={setCaptureRoom}
                    capturePanel={
                      <section
                        aria-label="Desktop capture"
                        hidden={!captureOpen || view !== 'things' || narrow}
                        ref={captureContainer}
                        className="workspace-capture"
                      >
                        <button className="text-button" onClick={() => setCaptureOpen(false)}>
                          Close capture
                        </button>{' '}
                        <CaptureForm
                          services={services}
                          inventoryId={inventoryId}
                          rooms={rooms}
                          signal={controller.signal}
                          roomRequest={captureRequest}
                          defaultCurrency={settings.defaultCurrency}
                          session={session}
                          onOpen={(id) => {
                            setCaptureOpen(false);
                            setInspectRequest((current) => ({
                              sequence: (current?.sequence ?? 0) + 1,
                              id,
                            }));
                          }}
                          onRoom={(room) => setRooms((values) => [...values, room])}
                          onSaved={async () => {
                            setActiveAttempt(undefined);
                            await reload();
                          }}
                          onAttempt={async (id) => {
                            setActiveAttempt(id);
                            await reload();
                          }}
                        />
                      </section>
                    }
                    requestDeletion={setDeletionRequested}
                  />
                </div>
                <PhoneCapture
                  services={services}
                  inventoryId={inventoryId}
                  ownerUid={inventory.ownerUid}
                  items={items}
                  rooms={rooms}
                  signal={controller.signal}
                  session={session}
                  open={narrow && captureOpen && view === 'things' && !ordinaryLocked}
                  close={() => {
                    setCaptureOpen(false);
                    setInspectRequest((current) => ({
                      sequence: (current?.sequence ?? 0) + 1,
                      id: '',
                    }));
                  }}
                  reopen={add}
                  onRoom={(room) => setRooms((values) => [...values, room])}
                  onSaved={async (settledId) => {
                    if (settledId)
                      setActiveAttempt((current) => (current === settledId ? undefined : current));
                    await reload();
                  }}
                  onAttempt={async (id) => {
                    setActiveAttempt(id);
                    await reload();
                  }}
                  onOpen={(id) => {
                    setCaptureOpen(false);
                    navigate('things');
                    setInspectRequest((current) => ({
                      sequence: (current?.sequence ?? 0) + 1,
                      id,
                    }));
                  }}
                />
              </>
            )}
          </fieldset>
        </div>
        {narrow && (
          <>
            <nav className="phone-tabs" aria-label="Phone inventory views">
              <button
                type="button"
                disabled={busy}
                aria-current={view === 'things' ? 'page' : undefined}
                onClick={() => navigate('things')}
              >
                Things
              </button>
              <button
                type="button"
                disabled={busy}
                aria-label={`Review inbox ${reviewCount}`}
                aria-current={view === 'review' ? 'page' : undefined}
                onClick={() => navigate('review')}
              >
                Review <span className="review-count">{reviewCount}</span>
              </button>
              <button
                type="button"
                disabled={busy}
                aria-current={!['things', 'review'].includes(view) ? 'page' : undefined}
                onClick={() => setMoreOpen(true)}
              >
                More
              </button>
            </nav>
            <button
              type="button"
              className="phone-add"
              aria-label="+ Add a thing"
              disabled={ordinaryLocked || loading || error}
              onClick={add}
            >
              + Add
            </button>
            {moreOpen && (
              <BottomSheet label="More views" close={() => setMoreOpen(false)}>
                <div className="more-view-links">
                  {VIEWS.filter((key) => !['things', 'review'].includes(key)).map((key) => (
                    <button
                      type="button"
                      className="text-button"
                      key={key}
                      disabled={busy}
                      onClick={() => {
                        setMoreOpen(false);
                        navigate(key);
                      }}
                    >
                      {titles[key]}
                    </button>
                  ))}
                  <span>✓ Owner verified</span>
                  <button
                    type="button"
                    className="text-button"
                    disabled={signOutPending}
                    onClick={() => void signOut()}
                  >
                    Sign out
                  </button>
                </div>
              </BottomSheet>
            )}
          </>
        )}
      </main>
    </MutationActivity.Provider>
  );
}
