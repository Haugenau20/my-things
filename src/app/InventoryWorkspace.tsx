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
  const captureContainer = useRef<HTMLDivElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [browseLocation, setBrowseLocation] = useState<string>();
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
    requestAnimationFrame(() =>
      captureContainer.current?.querySelector<HTMLInputElement>('input')?.focus(),
    );
  }, [navigate, ordinaryLocked, loading, error]);
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
            {!['things', 'review', 'trash'].includes(view) && <h1>{titles[view]}</h1>}
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
                      setBrowseLocation(key);
                      navigate('things');
                    }}
                  />
                )}
                {view === 'overview' && (
                  <section aria-label="Inventory overview">
                    <p>
                      {owned.length} owned things in{' '}
                      {rooms.filter((room) => room.archivedAt === null).length} active rooms.
                    </p>
                    {rooms
                      .filter(
                        (room) =>
                          room.archivedAt === null ||
                          items.some((item) => item.roomId === room.id && item.deletedAt === null),
                      )
                      .map((room) => (
                        <button
                          className="text-button"
                          key={room.id}
                          onClick={() => {
                            setBrowseLocation('room:' + room.id);
                            navigate('things');
                          }}
                        >
                          {room.name}
                          {room.archivedAt ? ' (archived)' : ''}
                        </button>
                      ))}
                  </section>
                )}
                <div
                  hidden={!captureOpen || view !== 'things'}
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
                </div>
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
                    requestDeletion={setDeletionRequested}
                  />
                </div>
              </>
            )}
          </fieldset>
        </div>
      </main>
    </MutationActivity.Provider>
  );
}
