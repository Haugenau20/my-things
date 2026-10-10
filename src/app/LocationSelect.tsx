import type { Room } from '../domain/item';
import type { Box } from '../domain/organize';
import { locationSchema } from '../domain/item';

export function selectedLocation(value: string) {
  const [kind, id] = value.split(':');
  return locationSchema.parse(
    kind === 'room' ? { kind, roomId: id } : kind === 'box' ? { kind, boxId: id } : { kind },
  );
}
export function LocationSelect({
  rooms,
  boxes,
  value,
  onChange,
  label,
}: {
  rooms: Room[];
  boxes: Box[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="unassigned">Unassigned</option>
        {rooms
          .filter((room) => room.archivedAt === null || value === `room:${room.id}`)
          .map((room) => (
            <option key={room.id} value={`room:${room.id}`} disabled={room.archivedAt !== null}>
              Room · {room.name}
              {room.archivedAt ? ' (archived)' : ''}
            </option>
          ))}
        {boxes
          .filter((box) => box.archivedAt === null || value === `box:${box.id}`)
          .map((box) => (
            <option key={box.id} value={`box:${box.id}`} disabled={box.archivedAt !== null}>
              Box · {box.label}
              {box.archivedAt ? ' (archived)' : ''}
            </option>
          ))}
      </select>
    </label>
  );
}
