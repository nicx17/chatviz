/**
 * Helpers shared by the platform parsers.
 *
 * Every parser produces chats of the shape:
 *   { title, platform, participants, you, youConfident, messages, media? }
 *
 * Messages do NOT carry `isSent` -- that is derived in the UI from `you`,
 * so the user can change who "you" are without re-importing.
 */

/**
 * Builds a normalized message with defaults for every field the UI reads.
 */
export function makeMessage(fields) {
  return {
    id: 0,
    sender: '',
    timestamp: 0,
    content: '',
    type: 'Generic',
    reactions: [],
    photos: [],
    videos: [],
    audioFiles: [],
    share: null,
    sticker: null,
    repliedTo: null,
    isUnsent: false,
    callDuration: undefined,
    isCall: false,
    ...fields,
  };
}

function messageKey(msg) {
  const uris = [...msg.photos, ...msg.videos, ...msg.audioFiles, msg.sticker]
    .map((m) => m?.uri ?? '')
    .join(',');
  return `${msg.timestamp}|${msg.sender}|${msg.type}|${msg.content}|${uris}|${msg.share?.link ?? ''}`;
}

/**
 * Removes the overlap between export files uploaded together. Messages are
 * tagged with `source` (index of the file they came from). Within one file
 * nothing is merged: chats really do contain identical messages in the same
 * minute ("ok", "ok", a burst of photos). Across files, each distinct
 * message is kept as many times as the file with the most copies has it.
 */
export function dedupeMessages(messages) {
  const kept = new Map(); // key -> copies kept so far
  const perSource = new Map(); // `${source}|${key}` -> copies seen in that file
  const deduped = [];
  for (const msg of messages) {
    const key = messageKey(msg);
    const sourceKey = `${msg.source ?? 0}|${key}`;
    const seen = (perSource.get(sourceKey) || 0) + 1;
    perSource.set(sourceKey, seen);
    if (seen > (kept.get(key) || 0)) {
      kept.set(key, seen);
      deduped.push(msg);
    }
  }
  return deduped;
}

/**
 * Dedupes, sorts chronologically (stable), then assigns sequential ids.
 */
export function finalizeMessages(messages) {
  const sorted = dedupeMessages(messages).sort((a, b) => a.timestamp - b.timestamp);
  for (let i = 0; i < sorted.length; i++) {
    sorted[i].id = i;
    delete sorted[i].source;
  }
  return sorted;
}

/**
 * Returns the sender with the most messages (fallback "you" guess).
 */
export function mostFrequentSender(messages, fallback = '') {
  const counts = new Map();
  for (const msg of messages) {
    counts.set(msg.sender, (counts.get(msg.sender) || 0) + 1);
  }
  let best = fallback;
  let max = 0;
  for (const [name, count] of counts) {
    if (count > max) {
      max = count;
      best = name;
    }
  }
  return best;
}

/**
 * Small, fast, non-cryptographic string hash (FNV-1a, 32-bit) used to build
 * stable chat ids so re-importing the same chat updates instead of duplicating.
 */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Stable chat id from platform + participants + first message time.
 * The last message is deliberately excluded so a newer export of the same
 * conversation replaces the older one.
 */
export function chatId(chat) {
  const people = [...chat.participants].sort().join('\u0000');
  const first = chat.messages[0]?.timestamp ?? 0;
  return `${chat.platform}-${hashString(`${chat.platform}|${people}|${first}|${chat.title}`)}`;
}

const PHOTO_EXT = /\.(jpe?g|png|gif|webp|heic|bmp)$/i;
const VIDEO_EXT = /\.(mp4|mov|3gp|m4v|webm|mkv)$/i;
const AUDIO_EXT = /\.(opus|ogg|m4a|mp3|aac|wav|amr)$/i;

/**
 * Classifies a media filename by extension.
 *
 * @returns {'photo' | 'video' | 'audio' | 'file'}
 */
export function mediaKind(filename) {
  if (PHOTO_EXT.test(filename)) return 'photo';
  if (VIDEO_EXT.test(filename)) return 'video';
  if (AUDIO_EXT.test(filename)) return 'audio';
  return 'file';
}

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', heic: 'image/heic', bmp: 'image/bmp',
  mp4: 'video/mp4', mov: 'video/quicktime', '3gp': 'video/3gpp', m4v: 'video/mp4',
  webm: 'video/webm', mkv: 'video/x-matroska',
  opus: 'audio/ogg', ogg: 'audio/ogg', m4a: 'audio/mp4', mp3: 'audio/mpeg',
  aac: 'audio/aac', wav: 'audio/wav', amr: 'audio/amr',
  pdf: 'application/pdf', vcf: 'text/vcard', txt: 'text/plain',
};

export function mimeFor(filename) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return MIME[ext] || 'application/octet-stream';
}
