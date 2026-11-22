import { useEffect, useRef, useState } from 'react';
import type { PhotoFile } from '../domain/item';
import type { PhotoLease, PhotoSession } from '../media/photo-session';

/** Stepping through items faster than this never starts their large detail downloads. */
export const DETAIL_DWELL_MS = 400;

export function PrivatePhoto({
  file,
  preview,
  session,
  alt,
  detail = false,
}: {
  file: PhotoFile;
  /** A smaller derivative shown at once, until the dwell has passed and `file` has loaded. */
  preview?: PhotoFile | undefined;
  session: PhotoSession;
  alt: string;
  detail?: boolean;
}) {
  const { storagePath, contentType, byteSize, width, height, sha256 } = file;
  const previewPath = preview?.storagePath;
  const previewType = preview?.contentType;
  const previewSize = preview?.byteSize;
  const previewWidth = preview?.width;
  const previewHeight = preview?.height;
  const previewHash = preview?.sha256;
  const element = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(detail);
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (detail || !element.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        // A view hidden with display:none reports no intersection; keep its photos mounted so
        // returning to it neither flashes nor issues new requests. Scrolling away still releases.
        if (!entry.isIntersecting && entry.target.getClientRects().length === 0) return;
        setVisible(entry.isIntersecting);
      },
      { rootMargin: '150px' },
    );
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [detail]);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    const leases: PhotoLease[] = [];
    let full = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Inventory refreshes recreate metadata objects even when the photo is unchanged.
    const take = (target: PhotoFile, shown: (lease: PhotoLease) => void, failed: () => void) =>
      void session.acquire(target, controller.signal).then(
        (result) => {
          if (controller.signal.aborted) {
            result.release();
            return;
          }
          leases.push(result);
          shown(result);
        },
        () => {
          if (!controller.signal.aborted) failed();
        },
      );
    const loadFull = () =>
      take(
        { storagePath, contentType, byteSize, width, height, sha256 },
        (lease) => {
          full = true;
          setFailed(false);
          setUrl(lease.url);
          // The preview stays in the retention cache; release its working-set lease.
          for (const other of leases.splice(0)) if (other !== lease) other.release();
          leases.push(lease);
        },
        () => {
          setUrl(undefined);
          setFailed(true);
        },
      );
    if (
      previewPath &&
      previewType === 'image/jpeg' &&
      previewSize !== undefined &&
      previewWidth !== undefined &&
      previewHeight !== undefined &&
      previewHash
    ) {
      take(
        {
          storagePath: previewPath,
          contentType: previewType,
          byteSize: previewSize,
          width: previewWidth,
          height: previewHeight,
          sha256: previewHash,
        },
        (lease) => {
          if (!full) setUrl(lease.url);
          else {
            leases.splice(leases.indexOf(lease), 1);
            lease.release();
          }
        },
        // A missing preview only delays the image; the full photo still loads.
        () => {},
      );
      timer = setTimeout(loadFull, DETAIL_DWELL_MS);
    } else loadFull();
    return () => {
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
      for (const lease of leases.splice(0)) lease.release();
      setUrl(undefined);
    };
  }, [
    session,
    storagePath,
    contentType,
    byteSize,
    width,
    height,
    sha256,
    previewPath,
    previewType,
    previewSize,
    previewWidth,
    previewHeight,
    previewHash,
    visible,
    retry,
  ]);
  return (
    <div
      ref={element}
      className={detail ? 'private-photo detail-photo' : 'private-photo thumbnail'}
    >
      {url ? (
        <img
          src={url}
          alt={alt}
          referrerPolicy="no-referrer"
          onError={() => {
            setUrl(undefined);
            setFailed(true);
          }}
        />
      ) : failed ? (
        <div className="photo-error">
          <p>Could not load this photo.</p>
          <button
            className="text-button"
            onClick={() => {
              setFailed(false);
              setRetry((value) => value + 1);
            }}
          >
            Retry photo
          </button>
        </div>
      ) : (
        <span className="photo-placeholder">{visible ? 'Loading photo…' : 'Photo'}</span>
      )}
    </div>
  );
}
