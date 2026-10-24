import { createContext, useContext, useEffect, useState } from 'react';

/**
 * Provides access to a chat's attachments, regardless of whether they live
 * in memory (fresh import, IndexedDB unavailable) or in IndexedDB.
 *
 * Value shape: { has(name): boolean, get(name): Promise<Blob | null> } | null
 */
export const MediaContext = createContext(null);

/**
 * Resolves an attachment name to an object URL for <img>/<video>/<audio>.
 * The URL is revoked on unmount -- with the virtualized list only visible
 * rows hold URLs, so memory stays bounded even for huge chats.
 *
 * @returns {string | null}
 */
export function useMediaUrl(name) {
  const source = useContext(MediaContext);
  const available = !!name && !!source?.has(name);
  const [entry, setEntry] = useState(null);

  useEffect(() => {
    if (!available) return undefined;

    let url = null;
    let cancelled = false;
    source.get(name)
      .then((blob) => {
        if (cancelled || !blob) return;
        url = URL.createObjectURL(blob);
        setEntry({ name, url });
      })
      // Unreadable (corrupt record, file moved on disk): keep the placeholder
      .catch(() => {});

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [available, source, name]);

  return available && entry?.name === name ? entry.url : null;
}

export function useHasMedia(name) {
  const source = useContext(MediaContext);
  return !!name && !!source?.has(name);
}
