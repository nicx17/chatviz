import { useState, useCallback, useRef, useEffect, useMemo, useDeferredValue } from 'react';
import { ArrowLeft, Clock, ArrowRightLeft, Search, UserRound, ChevronDown } from 'lucide-react';
import ChatView from './ChatView.jsx';
import StatsBar from './StatsBar.jsx';
import ChatToolbar from './ChatToolbar.jsx';
import ThemePicker from './ThemePicker.jsx';
import { MediaContext } from '../hooks/useMediaUrl.js';
import { computeStats, findIndexAtOrAfter } from '../utils/layout.js';

// ---------------------------------------------------------------------------
// Chat screen -- header, optional search bar, stats and the virtual list
// ---------------------------------------------------------------------------

export default function ChatScreen({
  active,
  notice,
  onBack,
  onSetYou,
  showTimestamps,
  onToggleTimestamps,
  invertedView,
  onToggleInverted,
  searchOpen,
  onSearchOpenChange,
}) {
  const { meta } = active;
  const chatRef = useRef(null);

  // isSent is derived from the chosen "you" so it can be changed any time
  const messages = useMemo(
    () => active.messages.map((m) => ({ ...m, isSent: m.type !== 'System' && m.sender === meta.you })),
    [active.messages, meta.you],
  );
  const stats = useMemo(() => computeStats(messages), [messages]);
  const lowerContents = useMemo(() => messages.map((m) => m.content.toLowerCase()), [messages]);

  // --- Search -------------------------------------------------------------
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const needle = searchOpen ? deferredQuery.trim().toLowerCase() : '';

  const matches = useMemo(() => {
    if (!needle) return [];
    const result = [];
    for (let i = 0; i < lowerContents.length; i++) {
      if (lowerContents[i].includes(needle)) result.push(i);
    }
    return result;
  }, [needle, lowerContents]);
  const matchSet = useMemo(() => new Set(matches), [matches]);

  // Position within `matches`; defaults to the newest match for each query
  const [cursor, setCursor] = useState({ needle: '', pos: 0 });
  const matchPos = cursor.needle === needle ? cursor.pos : matches.length - 1;
  const activeMatch = matches.length > 0 ? matches[matchPos] : -1;

  useEffect(() => {
    if (activeMatch >= 0) chatRef.current?.scrollToIndex(activeMatch);
  }, [activeMatch]);

  const step = useCallback((delta) => {
    if (matches.length === 0) return;
    const pos = (matchPos + delta + matches.length) % matches.length;
    setCursor({ needle, pos });
  }, [matches.length, matchPos, needle]);

  const closeSearch = useCallback(() => {
    onSearchOpenChange(false);
    setQuery('');
  }, [onSearchOpenChange]);

  // Ctrl/Cmd+F opens search
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        onSearchOpenChange(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSearchOpenChange]);

  const jumpToDate = useCallback((value) => {
    const [y, m, d] = value.split('-').map(Number);
    const index = findIndexAtOrAfter(messages, new Date(y, m - 1, d).getTime());
    chatRef.current?.scrollToIndex(index);
  }, [messages]);

  return (
    <MediaContext value={active.media}>
      <div className="flex h-full flex-col bg-ig-bg">
        <ChatHeader
          title={meta.title}
          participants={meta.participants}
          you={meta.you}
          onSetYou={onSetYou}
          onBack={onBack}
          showTimestamps={showTimestamps}
          onToggleTimestamps={onToggleTimestamps}
          invertedView={invertedView}
          onToggleInverted={onToggleInverted}
          searchOpen={searchOpen}
          onToggleSearch={() => (searchOpen ? closeSearch() : onSearchOpenChange(true))}
        />

        {searchOpen && (
          <ChatToolbar
            query={query}
            onQueryChange={setQuery}
            matchCount={matches.length}
            matchPos={matchPos}
            onNext={() => step(-1)}
            onPrev={() => step(1)}
            onClose={closeSearch}
            firstTs={meta.firstTs}
            lastTs={meta.lastTs}
            onJumpToDate={jumpToDate}
          />
        )}

        {!meta.youConfident && meta.participants.length > 1 && (
          <YouPrompt participants={meta.participants} onSetYou={onSetYou} />
        )}

        {notice && (
          <p className="shrink-0 border-b border-warn-border bg-warn-bg px-4 py-2 text-xs text-warn">
            {notice}
          </p>
        )}

        <StatsBar stats={stats} />

        <ChatView
          ref={chatRef}
          messages={messages}
          showTimestamps={showTimestamps}
          invertedView={invertedView}
          isGroup={meta.participants.length > 2}
          searchQuery={needle}
          matchSet={matchSet}
          activeMatch={activeMatch}
        />
      </div>
    </MediaContext>
  );
}

/**
 * Shown when the parser couldn't tell which participant is the user.
 */
function YouPrompt({ participants, onSetYou }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-ig-border bg-ig-surface px-3 py-2.5 animate-fade-in sm:px-4">
      <UserRound size={16} className="text-accent" />
      <span className="text-sm text-ig-text-primary">Which one is you?</span>
      {participants.slice(0, 8).map((p) => (
        <button
          key={p}
          onClick={() => onSetYou(p)}
          className="max-w-full truncate rounded-full border border-ig-border px-3 py-1.5 text-xs text-ig-text-secondary transition-colors hover:border-accent hover:text-ig-text-primary"
        >
          {p}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat header -- icon-only buttons on phones, labelled from `sm` up
// ---------------------------------------------------------------------------

function HeaderToggle({ on, onClick, label, shortLabel, icon: Icon, id, title }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full border text-xs font-medium transition-colors sm:h-8 sm:px-3 ${
        on
          ? 'border-accent/30 bg-accent/15 text-accent'
          : 'border-transparent text-ig-text-secondary hover:bg-ig-surface-hover hover:text-ig-text-primary'
      }`}
      aria-label={label}
      aria-pressed={on}
      id={id}
      title={title || label}
    >
      <Icon size={16} />
      <span className="hidden sm:inline">{shortLabel}</span>
    </button>
  );
}

function ChatHeader({
  title,
  participants,
  you,
  onSetYou,
  onBack,
  showTimestamps,
  onToggleTimestamps,
  invertedView,
  onToggleInverted,
  searchOpen,
  onToggleSearch,
}) {
  const otherName =
    participants.length <= 2
      ? title
      : `${title} · ${participants.length} participants`;
  const youKnown = participants.includes(you);

  return (
    <header className="flex shrink-0 items-center gap-1 border-b border-ig-border bg-ig-bg px-1.5 py-1.5 sm:gap-3 sm:px-4 sm:py-3">
      <button
        onClick={onBack}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ig-text-primary transition-colors hover:bg-ig-surface-hover"
        aria-label="Go back"
        id="btn-back"
      >
        <ArrowLeft size={22} />
      </button>

      {/* Avatar (hidden on phones to leave room for the name) */}
      <div className="hidden h-9 w-9 shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-br from-ig-gradient-start via-ig-gradient-mid to-ig-gradient-end text-sm font-semibold text-white sm:flex">
        {title.charAt(0).toUpperCase()}
      </div>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] font-semibold text-ig-text-primary sm:text-base">
          {otherName}
        </h1>
        {participants.length > 1 && (
          // The select is invisible and covers the label: it keeps the native
          // picker (best on phones) while its 16px font stops iOS zooming in
          <label className="relative flex w-fit max-w-full items-center gap-1 rounded text-[11px] text-ig-text-tertiary has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-accent">
            <span className="shrink-0">You are</span>
            <span className="truncate text-ig-text-secondary">{youKnown ? you : '—'}</span>
            <ChevronDown size={12} className="shrink-0" />
            <select
              value={youKnown ? you : ''}
              onChange={(e) => onSetYou(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer appearance-none text-base opacity-0"
              id="select-you"
              aria-label="Which participant are you?"
            >
              {!youKnown && <option value="">—</option>}
              {participants.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex shrink-0 items-center sm:gap-1.5">
        <HeaderToggle
          on={searchOpen}
          onClick={onToggleSearch}
          label="Search messages"
          shortLabel="Search"
          icon={Search}
          id="btn-search"
          title="Search (Ctrl+F)"
        />
        <HeaderToggle
          on={invertedView}
          onClick={onToggleInverted}
          label="Swap sides"
          shortLabel="Swap"
          icon={ArrowRightLeft}
          id="btn-invert"
        />
        <HeaderToggle
          on={showTimestamps}
          onClick={onToggleTimestamps}
          label="Show timestamps"
          shortLabel="Timestamps"
          icon={Clock}
          id="btn-timestamps"
        />
        <ThemePicker />
      </div>
    </header>
  );
}
