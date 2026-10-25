import { useRef, useEffect, useCallback, useMemo, useImperativeHandle, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import MessageBubble from './MessageBubble.jsx';
import {
  getBubblePosition,
  getDateSeparator,
  getTimeGap,
} from '../utils/layout.js';

// Memoize the bubble to prevent re-renders when only scroll position changes.
// Defined before ChatView to satisfy no-use-before-define.
const MemoizedBubble = memo((props) => <MessageBubble {...props} />);
MemoizedBubble.displayName = 'MemoizedBubble';

/**
 * Virtualized chat view using @tanstack/react-virtual.
 *
 * Performance strategy:
 * - Only DOM nodes for visible messages (+ overscan) are rendered.
 * - Row height estimation with dynamic measurement for accurate scrollbar.
 * - Pre-computed layout metadata (bubble position, date headers, time gaps)
 *   via useMemo to avoid per-render recalculation.
 * - Memoized MessageBubble prevents re-renders during scroll. Search props
 *   are only passed to matching rows so typing doesn't re-render the rest.
 *
 * Exposes `scrollToIndex(index)` via `ref` for search / jump-to-date.
 */
export default function ChatView({
  ref,
  messages,
  showTimestamps,
  invertedView,
  isGroup,
  searchQuery,
  matchSet,
  activeMatch,
}) {
  const parentRef = useRef(null);
  const hasScrolledRef = useRef(false);

  // Pre-compute layout metadata once for all messages.
  // This avoids running getBubblePosition / getDateSeparator on every
  // virtualizer render call.
  const layoutMeta = useMemo(
    () =>
      messages.map((_, i) => ({
        bubblePosition: getBubblePosition(messages, i),
        dateSeparator: getDateSeparator(messages, i),
        timeGap: getTimeGap(messages, i),
      })),
    [messages],
  );

  // Estimate row height: date headers add ~48px, time gaps add ~32px,
  // base message is ~56px, media messages are taller.
  const estimateSize = useCallback(
    (index) => {
      const msg = messages[index];
      const meta = layoutMeta[index];
      let h = 52; // base bubble height

      if (meta.dateSeparator) h += 44;
      if (meta.timeGap) h += 28;
      if (msg.photos?.length) h += 200;
      if (msg.videos?.length) h += 200;
      if (msg.audioFiles?.length) h += 56;
      if (msg.share) h += 72;
      if (msg.reactions?.length) h += 24;
      if (msg.repliedTo) h += 44;

      return h;
    },
    [messages, layoutMeta],
  );

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is safe here; we don't pass virtualizer fns to memoized children
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 30, // render 30 extra rows above/below viewport for smooth scroll
    getItemKey: (index) => messages[index].id,
  });

  useImperativeHandle(ref, () => ({
    scrollToIndex(index) {
      virtualizer.scrollToIndex(index, { align: 'center', behavior: 'auto' });
    },
  }), [virtualizer]);

  // Auto-scroll to bottom on first load
  useEffect(() => {
    if (!hasScrolledRef.current && messages.length > 0) {
      // Small delay to let the virtualizer measure
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(messages.length - 1, {
          align: 'end',
          behavior: 'auto',
        });
        hasScrolledRef.current = true;
      });
    }
  }, [messages.length, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-y-auto overflow-x-hidden"
      id="chat-scroll-container"
    >
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualItems.map((virtualRow) => {
          const msg = messages[virtualRow.index];
          const meta = layoutMeta[virtualRow.index];
          const isMatch = matchSet?.has(virtualRow.index);

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 w-full"
              // `top`, not a transform: the sticky date header is laid out
              // from the row's layout position, which a transform doesn't move
              style={{ top: virtualRow.start }}
            >
              {/* Date separator */}
              {meta.dateSeparator && (
                <div className="date-header flex items-center justify-center py-3">
                  <span className="rounded-full bg-ig-surface-elevated/80 px-3 py-1 text-xs font-medium text-ig-text-secondary">
                    {meta.dateSeparator}
                  </span>
                </div>
              )}

              {/* Time gap indicator */}
              {meta.timeGap && !meta.dateSeparator && (
                <div className="flex items-center justify-center py-1.5">
                  <span className="text-[11px] text-ig-text-tertiary">
                    {meta.timeGap}
                  </span>
                </div>
              )}

              <MemoizedBubble
                msg={msg}
                bubblePosition={meta.bubblePosition}
                showTimestamps={showTimestamps}
                invertedView={invertedView}
                isGroup={isGroup}
                highlight={isMatch ? searchQuery : undefined}
                isActiveMatch={virtualRow.index === activeMatch}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
