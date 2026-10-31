import type { Item, Room } from '../domain/item';
import type { Box } from '../domain/organize';
import { boxState, formatMoney } from '../domain/organize';
import { boxLabel, roomLabel } from '../domain/browse';
import type { FirebaseServices } from '../data/firebase';
import type { PhotoSession } from '../media/photo-session';
import { PrivatePhoto } from './PrivatePhoto';
import { PhotoAttachment } from './PhotoAttachment';
import { ItemEditor } from './ItemEditor';

export function ItemDetail({
  item,
  compact,
  visible,
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
  setDefaultCurrency,
  requestDeletion,
  close,
  fullView,
  move,
  nextReview,
}: {
  item: Item;
  compact: boolean;
  visible: Item[];
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
  setDefaultCurrency: (currency: string) => Promise<void>;
  requestDeletion: (item: Item) => void;
  close: () => void;
  fullView: () => void;
  move: (direction: number) => void;
  nextReview: () => void;
}) {
  const index = visible.findIndex((entry) => entry.id === item.id);
  const ready = item.photos.filter((photo) => photo.state === 'ready');
  const photos = compact ? ready.filter((photo) => photo.id === item.coverPhotoId) : ready;
  const state = boxState(item);
  const box = boxLabel(typeof state === 'string' ? state : state.boxId, boxes);
  return (
    <section
      className={compact ? 'inspector-panel' : 'item-full-view'}
      aria-label={compact ? 'Item inspector' : 'Full item view'}
    >
      {compact ? (
        <div className="inspector-navigation">
          <button
            className="text-button"
            aria-label="Previous item"
            disabled={!visible.length || index === 0}
            onClick={() => move(-1)}
          >
            ‹
          </button>
          <span
            title={index >= 0 ? `${index + 1} of ${visible.length}` : 'Outside current filters'}
          >
            {index >= 0 ? `${index + 1} of ${visible.length}` : 'Outside current filters'}
          </span>
          <button
            className="text-button"
            aria-label="Next item"
            disabled={!visible.length || index === visible.length - 1}
            onClick={() => move(1)}
          >
            ›
          </button>
          <button
            className="text-button"
            aria-label="Open full view"
            title="Open full view"
            onClick={fullView}
          >
            ↗
          </button>
          <button className="text-button" aria-label="Close inspector" onClick={close}>
            ×
          </button>
        </div>
      ) : (
        <button className="text-button" onClick={close}>
          Back to gallery
        </button>
      )}
      {!compact && (
        <>
          <h2>{item.name}</h2>
          <p>
            {roomLabel(item.roomId, rooms)} · {box} ·{' '}
            {item.reviewStatus === 'reviewed' ? 'Reviewed' : 'Needs review'}
            {item.deletedAt ? ' · Trash' : ''}
          </p>
          <p className="supporting">
            Room: {roomLabel(item.roomId, rooms)} · Quantity: {item.quantity}
          </p>
        </>
      )}
      <div className={compact ? 'inspector-content' : 'item-detail-layout'}>
        <div className="item-detail-media">
          <div className="detail-photos">
            {!photos.length && (
              <div className="private-photo inspector-cover">
                <span className="photo-placeholder">No photo yet</span>
              </div>
            )}
            {photos.map((photo) => (
              <PrivatePhoto
                key={photo.id}
                file={photo.detail}
                session={session}
                detail
                alt={`${item.name} · photo ${ready.indexOf(photo) + 1}`}
              />
            ))}
          </div>
          {item.deletedAt === null && (item.photos.length === 0 || activeAttempt === item.id) && (
            <PhotoAttachment
              key={`photos-${item.id}`}
              item={item}
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
        {compact && (
          <div className="inspector-title">
            <h2>{item.name}</h2>
            <p>
              {item.reviewStatus === 'reviewed' ? 'Reviewed' : 'Needs review'} · {item.quantity}{' '}
              {item.quantity === 1 ? 'unit' : 'units'} · {formatMoney(item.estimatedValue)}
              {item.deletedAt ? ' · Trash' : ''}
            </p>
          </div>
        )}
        <ItemEditor
          key={`editor-${item.id}`}
          item={item}
          inspector={compact}
          rooms={rooms}
          boxes={boxes}
          services={services}
          inventoryId={inventoryId}
          defaultCurrency={defaultCurrency}
          setDefaultCurrency={setDefaultCurrency}
          requestDeletion={requestDeletion}
          signal={signal}
          reload={reload}
          next={nextReview}
        />
      </div>
    </section>
  );
}
