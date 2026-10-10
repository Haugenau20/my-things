import type { Item, Room } from '../domain/item';
import type { Box } from '../domain/organize';
import { boxState } from '../domain/organize';
import { roomLabel, boxLabel } from '../domain/browse';
import type { Grouping } from '../domain/browse';
import type { PhotoSession } from '../media/photo-session';
import { PrivatePhoto } from './PrivatePhoto';

export function ItemCard({
  item,
  rooms,
  boxes,
  grouping,
  session,
  checked,
  selecting,
  inspected = false,
  disabled,
  open,
  toggle,
}: {
  item: Item;
  rooms: Room[];
  boxes: Box[];
  grouping: Grouping;
  session: PhotoSession;
  checked: boolean;
  selecting: boolean;
  inspected?: boolean;
  disabled: boolean;
  open: () => void;
  toggle: (checked: boolean, shift: boolean) => void;
}) {
  const cover = item.photos.find(
    (photo) => photo.id === item.coverPhotoId && photo.state === 'ready',
  );
  const state = boxState(item);
  return (
    <article
      className={`item-card${checked ? ' is-selected' : ''}${selecting ? ' is-selecting' : ''}${inspected ? ' is-inspected' : ''}`}
      onClick={(event) => {
        if (event.target instanceof Element && !event.target.closest('input,button,label,a'))
          open();
      }}
    >
      {cover ? (
        <PrivatePhoto file={cover.thumbnail} session={session} alt={item.name} />
      ) : (
        <div className="private-photo thumbnail">
          <span className="photo-placeholder">No photo yet</span>
        </div>
      )}
      <label className="card-select">
        <input
          type="checkbox"
          aria-label={`Select ${item.name}`}
          disabled={disabled}
          checked={checked}
          onChange={(event) =>
            toggle(
              event.target.checked,
              event.nativeEvent instanceof MouseEvent && event.nativeEvent.shiftKey,
            )
          }
        />
      </label>
      <div className="item-card-body">
        <div className="card-title-row">
          <button className="item-card-name" aria-label={`Open ${item.name}`} onClick={open}>
            {item.name}
          </button>
          {item.reviewStatus === 'needs_review' && (
            <span className="review-dot" role="img" aria-label="Needs review" />
          )}
        </div>
        <div className="card-tags">
          {grouping !== 'room' && <span className="room-tag">{roomLabel(item.roomId, rooms)}</span>}
          {grouping !== 'box' &&
            (typeof state === 'string' ? (
              <span className="packing-text">{state === 'gone' ? 'gone' : 'not packed'}</span>
            ) : (
              <span className="box-tag">{boxLabel(state.boxId, boxes)}</span>
            ))}
        </div>
        <span className="item-card-meta">
          {item.decision.replaceAll('_', ' ')} · {item.progress.replaceAll('_', ' ')}
        </span>
      </div>
    </article>
  );
}
