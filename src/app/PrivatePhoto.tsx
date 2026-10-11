import { useEffect, useRef, useState } from 'react';
import type { PhotoFile } from '../domain/item';
import type { PhotoLease, PhotoSession } from '../media/photo-session';

export function PrivatePhoto({
  file,
  session,
  alt,
  detail = false,
}: {
  file: PhotoFile;
  session: PhotoSession;
  alt: string;
  detail?: boolean;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(detail);
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (detail || !element.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { rootMargin: '150px' },
    );
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [detail]);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    let lease: PhotoLease | undefined;
    void session.acquire(file, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) {
          result.release();
          return;
        }
        lease = result;
        setFailed(false);
        setUrl(result.url);
      },
      () => {
        if (!controller.signal.aborted) setFailed(true);
      },
    );
    return () => {
      controller.abort();
      lease?.release();
      setUrl(undefined);
    };
  }, [session, file, visible, retry]);
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
