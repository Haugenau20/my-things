import { useState } from 'react';
import type { Box } from '../domain/organize';
import type { ItemGroup } from '../domain/browse';

export function GroupActions({
  group,
  boxes,
  disabled,
  canPack,
  select,
  openBox,
  pack,
}: {
  group: ItemGroup;
  boxes: Box[];
  disabled: boolean;
  canPack: boolean;
  select: () => void;
  openBox: () => void;
  pack: (destination: { boxId: string } | { newLabel: string }) => Promise<void>;
}) {
  const [packing, setPacking] = useState(false);
  const [label, setLabel] = useState('');
  const [duplicate, setDuplicate] = useState(false);
  async function create(confirmed = false) {
    if (!label.trim() || label.trim().length > 100) return;
    if (
      !confirmed &&
      boxes.some((box) => box.label.toLocaleLowerCase() === label.trim().toLocaleLowerCase())
    ) {
      setDuplicate(true);
      return;
    }
    setDuplicate(false);
    await pack({ newLabel: label.trim() });
    setPacking(false);
  }
  return (
    <fieldset className="group-actions" disabled={disabled}>
      <button className="text-button" onClick={select}>
        Select all
      </button>
      {group.box && !['unpacked', 'gone'].includes(group.box) && (
        <button className="text-button" onClick={openBox}>
          Open box
        </button>
      )}
      {canPack && (
        <div className="group-pack">
          <button
            className="primary-button"
            aria-expanded={packing}
            onClick={() => setPacking(!packing)}
          >
            Pack into box…
          </button>
          {packing && (
            <div className="group-pack-popover">
              {boxes
                .filter((box) => box.archivedAt === null)
                .map((box) => (
                  <button
                    key={box.id}
                    className="text-button"
                    aria-label={`Pack into ${box.label}`}
                    onClick={async () => {
                      await pack({ boxId: box.id });
                      setPacking(false);
                    }}
                  >
                    {box.label}
                  </button>
                ))}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void create();
                }}
              >
                <label>
                  New box label
                  <input
                    required
                    maxLength={100}
                    value={label}
                    onChange={(event) => {
                      setLabel(event.target.value);
                      setDuplicate(false);
                    }}
                  />
                </label>
                <button type="submit" className="secondary-button">
                  Create box and pack
                </button>
              </form>
              {duplicate && (
                <div className="confirmation">
                  <p>
                    A box with this label already exists. Create another with a separate identity?
                  </p>
                  <button className="secondary-button" onClick={() => void create(true)}>
                    Create duplicate and pack
                  </button>
                  <button className="text-button" onClick={() => setDuplicate(false)}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </fieldset>
  );
}
