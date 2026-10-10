import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export function BottomSheet({
  label,
  close,
  children,
}: {
  label: string;
  close: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="bottom-sheet"
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="sheet-heading">
        <h2>{label}</h2>
        <button type="button" className="text-button" aria-label={`Close ${label}`} onClick={close}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
