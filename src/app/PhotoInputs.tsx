import { useRef } from 'react';

export function PhotoInputs({
  onSelect,
  disabled = false,
}: {
  onSelect: (files: File[], append: boolean) => void;
  disabled?: boolean;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  return (
    <div className="photo-inputs">
      <input
        ref={camera}
        hidden
        type="file"
        aria-label="Take a photo"
        accept="image/*,.heic,.heif"
        capture="environment"
        disabled={disabled}
        onChange={(event) => {
          if (event.target.files?.length) onSelect(Array.from(event.target.files), true);
          event.target.value = '';
        }}
      />
      <button
        type="button"
        className="secondary-button"
        disabled={disabled}
        onClick={() => camera.current?.click()}
      >
        Take photo
      </button>
      <input
        ref={picker}
        hidden
        type="file"
        aria-label="Choose photos"
        accept="image/*,.heic,.heif"
        multiple
        disabled={disabled}
        onChange={(event) => {
          if (event.target.files?.length) onSelect(Array.from(event.target.files), false);
          event.target.value = '';
        }}
      />
      <button
        type="button"
        className="secondary-button"
        disabled={disabled}
        onClick={() => picker.current?.click()}
      >
        Choose photos
      </button>
    </div>
  );
}
