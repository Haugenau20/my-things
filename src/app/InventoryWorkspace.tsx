import { useCallback, useEffect, useRef, useState } from 'react';
import type { FirebaseServices } from '../data/firebase';
import type { Inventory } from '../domain/inventory';
import { isVisible } from '../domain/item';
import type { Item, Room } from '../domain/item';
import { loadItems, loadRooms } from '../data/capture-repository';
import { PhotoSession } from '../media/photo-session';
import { CaptureForm } from './CaptureForm';
import { RecoveryPanel } from './RecoveryPanel';
import { PrivatePhoto } from './PrivatePhoto';

export function InventoryWorkspace({
  services,
  inventoryId,
  inventory,
}: {
  services: FirebaseServices;
  inventoryId: string;
  inventory: Inventory;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selected, setSelected] = useState<string>();
  const [activeAttempt, setActiveAttempt] = useState<string>();
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [session] = useState(() => new PhotoSession(services.storage));
  const [controller] = useState(() => new AbortController());
  const version = useRef(0);
  const reload = useCallback(async () => {
    const request = ++version.current;
    try {
      const [nextItems, nextRooms] = await Promise.all([
        loadItems(services.db, inventoryId),
        loadRooms(services.db, inventoryId),
      ]);
      if (!controller.signal.aborted && version.current === request) {
        setItems(nextItems);
        setRooms(nextRooms);
        setError(false);
      }
    } catch {
      if (!controller.signal.aborted && version.current === request) setError(true);
    } finally {
      if (!controller.signal.aborted && version.current === request) setLoading(false);
    }
  }, [services, inventoryId, controller]);
  useEffect(() => {
    void reload();
    return () => {
      ++version.current;
      controller.abort();
      session.dispose();
    };
  }, [reload, controller, session]);
  const visible = items
    .filter(isVisible)
    .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
  const detail = visible.find((item) => item.id === selected);
  const roomName = (id: string | null) =>
    id ? (rooms.find((value) => value.id === id)?.name ?? 'Unavailable room') : 'Unassigned';
  return (
    <main className="workspace">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">Your private inventory</p>
          <h1>{inventory.displayName}</h1>
          <p className="access-badge">✓ Owner access verified</p>
        </div>
        <button className="text-button" onClick={() => void reload()}>
          Refresh inventory
        </button>
      </div>
      {error && (
        <p role="alert" className="error-message">
          Could not refresh inventory. Records may be out of date or invalid. Check your connection
          and refresh before continuing.
        </p>
      )}
      {loading ? (
        <p role="status">Loading saved items and rooms…</p>
      ) : (
        <>
          <RecoveryPanel
            items={items.filter(
              (item) =>
                item.id !== activeAttempt &&
                item.recordState !== 'ready' &&
                item.coverPhotoId === null,
            )}
            services={services}
            inventoryId={inventoryId}
            signal={controller.signal}
            reload={reload}
          />
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
            <section className="gallery-panel" aria-label="Saved inventory">
              {detail ? (
                <>
                  <button className="text-button" onClick={() => setSelected(undefined)}>
                    Back to gallery
                  </button>
                  <h2>{detail.name}</h2>
                  <p>
                    {detail.currentLocation.kind === 'room'
                      ? roomName(detail.currentLocation.roomId)
                      : detail.currentLocation.kind === 'box'
                        ? 'In a box'
                        : 'Unassigned'}{' '}
                    · {detail.reviewStatus === 'reviewed' ? 'Reviewed' : 'Needs review'}
                  </p>
                  <p className="supporting">
                    Original room: {roomName(detail.originalRoomId)} · Quantity: {detail.quantity}
                  </p>
                  <div className="detail-photos">
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
                </>
              ) : (
                <>
                  <div className="gallery-heading">
                    <h2>Your things</h2>
                    <span>{visible.length} saved</span>
                  </div>
                  {!visible.length && (
                    <div className="empty-gallery">
                      <span aria-hidden="true">◌</span>
                      <h3>A little space to get started.</h3>
                      <p>Your saved things will appear here.</p>
                    </div>
                  )}
                  <div className="gallery-grid">
                    {visible.map((item) => {
                      const cover = item.photos.find((photo) => photo.id === item.coverPhotoId);
                      return (
                        <article key={item.id} className="item-card">
                          {cover && (
                            <PrivatePhoto
                              file={cover.thumbnail}
                              session={session}
                              alt={item.name}
                            />
                          )}
                          <button
                            className="item-card-name"
                            aria-label={`Open ${item.name}`}
                            onClick={() => setSelected(item.id)}
                          >
                            {item.name}
                          </button>
                          <span className="item-card-meta">
                            {item.currentLocation.kind === 'room'
                              ? roomName(item.currentLocation.roomId)
                              : item.currentLocation.kind === 'box'
                                ? 'In a box'
                                : 'Unassigned'}{' '}
                            · {item.reviewStatus === 'reviewed' ? 'Reviewed' : 'Needs review'}
                          </span>
                        </article>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
