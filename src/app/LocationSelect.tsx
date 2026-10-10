import type { Room } from '../domain/item';
import type { Box } from '../domain/organize';
export function RoomSelect({
  rooms,
  value,
  onChange,
  label,
}: {
  rooms: Room[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">No room</option>
        {rooms
          .filter((room) => room.archivedAt === null || value === room.id)
          .map((room) => (
            <option key={room.id} value={room.id} disabled={room.archivedAt !== null}>
              {room.name}
              {room.archivedAt ? ' (archived)' : ''}
            </option>
          ))}
      </select>
    </label>
  );
}
export function BoxSelect({
  boxes,
  value,
  onChange,
  label,
}: {
  boxes: Box[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Not packed</option>
        {boxes
          .filter((box) => box.archivedAt === null || value === box.id)
          .map((box) => (
            <option key={box.id} value={box.id} disabled={box.archivedAt !== null}>
              {box.label}
              {box.archivedAt ? ' (archived)' : ''}
            </option>
          ))}
      </select>
    </label>
  );
}
