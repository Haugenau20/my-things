import { useEffect, useState } from 'react';

export function PhotoSlots({
  files,
  disabled,
  select,
}: {
  files: File[];
  disabled: boolean;
  select: (files: File[], append: boolean) => void;
}) {
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.slice(0, 2).map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);
  return (
    <div className="capture-photo-slots">
      {[0, 1].map((index) => (
        <div
          key={index}
          role="group"
          aria-label={`Photo slot ${index + 1}`}
          className="capture-photo-slot"
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (!disabled && event.dataTransfer.files.length)
              select(Array.from(event.dataTransfer.files), index !== 0);
          }}
        >
          {previews[index] ? (
            <img src={previews[index]} alt={`Selected photo ${index + 1}`} />
          ) : (
            <span>
              {index === 0 ? 'Cover photo' : '+ Add photo'}
              <small>Drop a photo here</small>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
