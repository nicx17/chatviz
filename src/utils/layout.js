/**
 * Layout, formatting and stats helpers for the chat view.
 */

// ---------------------------------------------------------------------------
// Grouping & layout
// ---------------------------------------------------------------------------

/**
 * System notices and reaction notifications render as compact events,
 * not bubbles: they don't group with messages or count in stats.
 */
export function isEvent(msg) {
  return msg.type === 'System' || msg.type === 'Reaction';
}

/**
 * Determines the bubble position class for consecutive messages from
 * the same sender within a time window (used for radius adjustments).
 *
 * @param {object[]} messages - Full message array.
 * @param {number} index - Current message index.
 * @returns {'solo' | 'first' | 'middle' | 'last'}
 */
export function getBubblePosition(messages, index) {
  const msg = messages[index];
  const prev = index > 0 ? messages[index - 1] : null;
  const next = index < messages.length - 1 ? messages[index + 1] : null;

  // 60-second grouping window
  const GROUP_MS = 60_000;

  const sameSenderAsPrev =
    prev &&
    !isEvent(prev) &&
    prev.sender === msg.sender &&
    msg.timestamp - prev.timestamp < GROUP_MS;

  const sameSenderAsNext =
    next &&
    !isEvent(next) &&
    next.sender === msg.sender &&
    next.timestamp - msg.timestamp < GROUP_MS;

  if (sameSenderAsPrev && sameSenderAsNext) return 'middle';
  if (sameSenderAsPrev) return 'last';
  if (sameSenderAsNext) return 'first';
  return 'solo';
}

/**
 * Checks whether a date separator should be shown before this message.
 *
 * @param {object[]} messages - Full message array.
 * @param {number} index - Current message index.
 * @returns {string | null} - Formatted date string, or null.
 */
export function getDateSeparator(messages, index) {
  const msg = messages[index];
  const prev = index > 0 ? messages[index - 1] : null;

  const msgDate = new Date(msg.timestamp);

  if (!prev || dayNumber(msgDate) !== dayNumber(new Date(prev.timestamp))) {
    return formatDateHeader(msgDate);
  }

  return null;
}

/**
 * Checks whether a time gap label should be shown (> 15 min gap).
 */
export function getTimeGap(messages, index) {
  const msg = messages[index];
  const prev = index > 0 ? messages[index - 1] : null;

  if (!prev) return null;

  const GAP_MS = 15 * 60_000; // 15 minutes
  if (msg.timestamp - prev.timestamp > GAP_MS) {
    return formatTime(new Date(msg.timestamp));
  }

  return null;
}

/**
 * Index of the first message at or after `timestamp` (binary search).
 * Returns the last index if every message is earlier.
 */
export function findIndexAtOrAfter(messages, timestamp) {
  let lo = 0;
  let hi = messages.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (messages[mid].timestamp < timestamp) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// ---------------------------------------------------------------------------
// Date/time formatting
// ---------------------------------------------------------------------------

/**
 * Local calendar day as a sequential number (DST-safe, month-boundary-safe).
 */
function dayNumber(date) {
  return Math.round(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000,
  );
}

export function formatDateHeader(date, now = new Date()) {
  const diffDays = dayNumber(now) - dayNumber(date);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';

  if (diffDays > 1 && diffDays < 7) {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
    });
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
    });
  }

  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTime(date) {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatTimestamp(timestamp) {
  return formatTime(new Date(timestamp));
}

export function formatShortDate(timestamp) {
  return timestamp
    ? new Date(timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '--';
}

/**
 * yyyy-mm-dd in local time, for <input type="date">.
 */
export function toDateInputValue(timestamp) {
  const d = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function computeStats(messages) {
  let sentByYou = 0;
  let sentByOther = 0;
  let photos = 0;
  let videos = 0;
  let audioFiles = 0;

  for (const m of messages) {
    if (isEvent(m)) continue;
    if (m.isSent) sentByYou++;
    else sentByOther++;
    photos += m.photos?.length || 0;
    videos += m.videos?.length || 0;
    audioFiles += m.audioFiles?.length || 0;
  }

  return {
    totalMessages: sentByYou + sentByOther,
    sentByYou,
    sentByOther,
    photos,
    videos,
    audioFiles,
    firstMessage: messages.length > 0 ? messages[0].timestamp : null,
    lastMessage: messages.length > 0 ? messages[messages.length - 1].timestamp : null,
  };
}
