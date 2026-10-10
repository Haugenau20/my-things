import { useCallback, useEffect, useRef, useState } from 'react';
import type { FirebaseServices } from '../data/firebase';
import type { Inventory } from '../domain/inventory';
import type { Item, Room } from '../domain/item';
import type { Box } from '../domain/organize';
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
}: {
  services: FirebaseServices;
  inventoryId: string;
  inventory: Inventory;
  environment: Environment;
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
  const [manage, setManage] = useState(false);
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
  return (
    <MutationActivity.Provider value={reportMutation}>
      <main className="workspace">
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
              loading || refreshing || error || mutating > 0 || !!deletionRequested || exportBusy
            }
            pause={setRestoreBusy}
            reload={reload}
            session={session}
          />
        </details>
        {restore && restore.state !== 'completed' && (
          <p role="alert" className="error-message">
            An import is unfinished ({restore.completedRecords} records verified). Ordinary changes
            and full export are paused. Open Restore backup and select every part of the original
            archive to resume.
            <button
              type="button"
              className="text-button"
              disabled={restoreBusy || exportBusy || refreshing}
              onClick={() => void reload()}
            >
              Refresh recovery report
            </button>
          </p>
        )}
        <fieldset
          className="inventory-actions"
          disabled={exportBusy || restoreBusy || (!!restore && restore.state !== 'completed')}
          inert={exportBusy || restoreBusy || (!!restore && restore.state !== 'completed')}
        >
          <div className="workspace-heading">
            <div>
              <p className="eyebrow">Your private inventory</p>
              <h1>{settings.displayName}</h1>
              <p className="access-badge">✓ Owner access verified</p>
            </div>
            <div className="save-actions">
              <button className="text-button" onClick={() => void reload()}>
                Refresh inventory
              </button>
              <button
                className="text-button"
                aria-expanded={manage}
                onClick={() => setManage((value) => !value)}
              >
                Manage locations
              </button>
            </div>
          </div>
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
              {manage && (
                <LocationManager
                  rooms={rooms}
                  boxes={boxes}
                  items={items}
                  services={services}
                  inventoryId={inventoryId}
                  reload={reload}
                  browse={(key) => setBrowseLocation(key === browseLocation ? undefined : key)}
                />
              )}
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
              <div className="inventory-layout">
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
                <InventoryBrowser
                  items={items}
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
      </main>
    </MutationActivity.Provider>
  );
}
