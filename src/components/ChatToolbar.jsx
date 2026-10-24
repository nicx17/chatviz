import { useEffect, useRef } from 'react';
import { Search, ChevronUp, ChevronDown, X, CalendarDays } from 'lucide-react';
import { toDateInputValue } from '../utils/layout.js';

/**
 * Search + jump-to-date bar shown under the chat header.
 *
 * Keyboard: Enter = next (older) match, Shift+Enter = previous, Esc = close.
 */
export default function ChatToolbar({
  query,
  onQueryChange,
  matchCount,
  matchPos,
  onPrev,
  onNext,
  onClose,
  firstTs,
  lastTs,
  onJumpToDate,
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) onPrev();
      else onNext();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const hasQuery = query.trim().length > 0;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-1 gap-y-2 border-b border-ig-border bg-ig-bg px-2 py-2 animate-fade-in sm:gap-2 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-ig-surface-elevated px-3 py-2 focus-within:outline-2 focus-within:outline-accent sm:py-1.5">
        <Search size={14} className="shrink-0 text-ig-text-tertiary" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search messages"
          className="min-w-0 flex-1 bg-transparent text-base text-ig-text-primary placeholder:text-ig-text-tertiary outline-none sm:text-sm"
          aria-label="Search messages"
          id="search-input"
        />
        {hasQuery && (
          <span className="shrink-0 text-xs tabular-nums text-ig-text-tertiary" aria-live="polite">
            {matchCount === 0 ? 'No results' : `${matchPos + 1} / ${matchCount}`}
          </span>
        )}
      </div>

      <div className="flex items-center">
        <button
          onClick={onPrev}
          disabled={matchCount === 0}
          className="toolbar-btn h-10 w-10 sm:h-auto sm:w-auto"
          aria-label="Newer match"
          title="Newer match (Shift+Enter)"
        >
          <ChevronDown size={18} />
        </button>
        <button
          onClick={onNext}
          disabled={matchCount === 0}
          className="toolbar-btn h-10 w-10 sm:h-auto sm:w-auto"
          aria-label="Older match"
          title="Older match (Enter)"
        >
          <ChevronUp size={18} />
        </button>
      </div>

      {/* Own row on phones (order-last), inline from `sm` up */}
      <label className="order-last flex w-full items-center gap-1.5 rounded-full bg-ig-surface-elevated px-3 py-1.5 text-xs text-ig-text-secondary focus-within:outline-2 focus-within:outline-accent sm:order-none sm:w-auto">
        <CalendarDays size={14} className="text-ig-text-tertiary" />
        <span className="sr-only">Jump to date</span>
        <input
          type="date"
          min={toDateInputValue(firstTs)}
          max={toDateInputValue(lastTs)}
          onChange={(e) => e.target.value && onJumpToDate(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-base text-ig-text-primary outline-none sm:text-xs"
          id="jump-date"
        />
      </label>

      <button onClick={onClose} className="toolbar-btn h-10 w-10 sm:h-auto sm:w-auto" aria-label="Close search">
        <X size={18} />
      </button>
    </div>
  );
}
