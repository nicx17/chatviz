/**
 * WhatsApp "Export chat" parser (.txt, or the .zip that includes media).
 *
 * Line formats vary by OS and phone locale:
 *   Android: 31/12/23, 9:41 PM - Alice: hello
 *            12/31/23, 21:41 - Alice: hello
 *   iOS:     [31/12/23, 21:41:05] Alice: hello
 *            [2023-12-31, 9:41:05 PM] Alice: hello
 *
 * - Lines that don't start with a timestamp continue the previous message.
 * - Lines without "Name: " after the timestamp are system messages
 *   ("Messages and calls are end-to-end encrypted", "Bob added Carol").
 * - The export uses invisible bidi marks (U+200E) and narrow no-break
 *   spaces (U+202F, before AM/PM) which are normalized away first.
 * - Day/month order is ambiguous; it's inferred from the whole file.
 */

import { makeMessage, finalizeMessages, mediaKind, mostFrequentSender } from './common.js';

const LINE_RE =
  /^\[?(\d{1,4})[./-](\d{1,2})[./-](\d{1,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([AaPp]\.?\s?[Mm]\.?)?\]?\s*(?:[-–]\s+)?(.*)$/;

// "<attached: 00000012-PHOTO-2023-01-01-12-00-00.jpg>" (iOS)
const IOS_ATTACHED_RE = /^<attached:\s*([^>]+)>\s*/;
// "IMG-20230101-WA0001.jpg (file attached)" (Android), caption may follow
const ANDROID_ATTACHED_RE = /^(\S.*?\.\w{2,5}) \(file attached\)\s*/;
// Exported "without media"
const OMITTED_RE = /^(?:<Media omitted>|(image|video|audio|sticker|GIF|document) omitted)$/i;
const DELETED_RE = /^(?:This message was deleted|You deleted this message)\.?$/i;
const EDITED_SUFFIX_RE = /\s*<This message was edited>$/;
// Notices iOS attributes to the other person in 1:1 chats
const NOTICE_RE = /end-to-end encrypted|security code|disappearing messages|blocked this contact|changed (?:their|your) phone number/i;
// iOS puts U+200E right after "Sender: " when the text is auto-generated
const MARK = ': ‎';

/**
 * Removes the invisible characters WhatsApp sprinkles into exports.
 */
function normalizeLine(line) {
  return line
    .replace(/[\u200e\u200f\u202a-\u202e\ufeff]/g, '')
    .replace(/[\u202f\u00a0]/g, ' ');
}

/**
 * Decides whether dates are day-first or month-first.
 *
 * @param {Array<[number, number, number]>} triples - Raw date fields
 * @param {string} [locale] - Fallback when every date is ambiguous
 * @returns {'YMD' | 'DMY' | 'MDY'}
 */
export function detectDateOrder(triples, locale) {
  if (triples.some(([a]) => a > 31)) return 'YMD';
  if (triples.some(([a]) => a > 12)) return 'DMY';
  if (triples.some(([, b]) => b > 12)) return 'MDY';
  const lang = locale ?? (typeof navigator !== 'undefined' ? navigator.language : 'en-GB');
  return /^en-(US|PH|CA)$/i.test(lang) ? 'MDY' : 'DMY';
}

function toTimestamp(m, order) {
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let year;
  let month;
  let day;
  if (order === 'YMD') [year, month, day] = [a, b, c];
  else if (order === 'DMY') [day, month, year] = [a, b, c];
  else [month, day, year] = [a, b, c];
  if (year < 100) year += 2000;

  let hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = m[6] ? Number(m[6]) : 0;
  const ampm = m[7]?.toLowerCase().replace(/[.\s]/g, '');
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;

  // Exports are in the phone's local time, so interpret as local
  return new Date(year, month - 1, day, hour, minute, second).getTime();
}

/**
 * Converts an entry's raw text into message fields (media, deleted, etc).
 */
function interpretBody(text) {
  let body = text.replace(EDITED_SUFFIX_RE, '');
  const fields = { content: body };

  if (DELETED_RE.test(body)) {
    return { content: '', isUnsent: true, deletedByYou: /^You /i.test(body) };
  }

  const omitted = body.match(OMITTED_RE);
  if (omitted) {
    const kind = (omitted[1] || 'image').toLowerCase();
    fields.content = '';
    if (kind === 'video') fields.videos = [{ uri: '' }];
    else if (kind === 'audio') fields.audioFiles = [{ uri: '' }];
    else if (kind === 'sticker') fields.sticker = { uri: '' };
    else if (kind === 'document') fields.content = '[Document omitted]';
    else fields.photos = [{ uri: '' }];
    return fields;
  }

  const attached = body.match(IOS_ATTACHED_RE) || body.match(ANDROID_ATTACHED_RE);
  if (attached) {
    const file = attached[1].trim();
    body = body.slice(attached[0].length).trim();
    fields.content = body;
    const kind = mediaKind(file);
    if (kind === 'photo' && /STICKER|^STK-/i.test(file)) fields.sticker = { uri: file };
    else if (kind === 'photo') fields.photos = [{ uri: file }];
    else if (kind === 'video') fields.videos = [{ uri: file }];
    else if (kind === 'audio') fields.audioFiles = [{ uri: file }];
    else fields.content = `📎 ${file}${body ? `\n${body}` : ''}`;
  }

  return fields;
}

/**
 * Whether a marked (auto-generated) iOS line is a chat event rather than
 * something a person sent. Group events come from the group's name, which
 * never writes an unmarked line; 1:1 notices are matched by wording.
 */
function isMarkedEvent(sender, text, realSenders) {
  if (IOS_ATTACHED_RE.test(text) || OMITTED_RE.test(text) || DELETED_RE.test(text)) return false;
  return !realSenders.has(sender) || NOTICE_RE.test(text);
}

export function looksLikeWhatsApp(text) {
  const lines = text.split(/\r?\n/, 20);
  let hits = 0;
  for (const line of lines) {
    if (LINE_RE.test(normalizeLine(line))) hits++;
  }
  return hits >= 1;
}

/**
 * Parses a WhatsApp export.
 *
 * @param {string} text - Contents of the exported .txt
 * @param {object} [opts]
 * @param {string} [opts.title] - Chat title (from the filename)
 * @param {string} [opts.locale] - Locale fallback for ambiguous dates
 * @returns {object} chat
 */
export function parseWhatsApp(text, { title = '', locale } = {}) {
  // Pass 1: split into entries
  const entries = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = normalizeLine(rawLine);
    const m = line.match(LINE_RE);
    if (m) {
      entries.push({ m, rest: m[8], marked: rawLine.includes(MARK) });
    } else if (entries.length > 0) {
      entries[entries.length - 1].rest += `\n${line}`;
    }
  }

  if (entries.length === 0) {
    throw new Error('This .txt file does not look like a WhatsApp chat export.');
  }

  // Pass 2: resolve date order using every date in the file
  const order = detectDateOrder(
    entries.map(({ m }) => [Number(m[1]), Number(m[2]), Number(m[3])]),
    locale,
  );

  // Pass 3: split off the sender. Lines without one are system events, and
  // so are "senders" with quotes: 'Alice changed the subject to "Trip: Rome"'
  const parsed = entries.map(({ m, rest, marked }) => {
    const timestamp = toTimestamp(m, order);
    const body = rest.replace(/\s+$/, '');
    const sep = body.indexOf(': ');
    const sender = sep > 0 ? body.slice(0, sep) : '';
    return sender && !/["“”]/.test(sender)
      ? { timestamp, sender, text: body.slice(sep + 2), marked }
      : { timestamp, sender: '', text: body, marked: false };
  });
  const realSenders = new Set(parsed.filter((p) => p.sender && !p.marked).map((p) => p.sender));

  // Pass 4: build messages
  const raw = [];
  const deletedByYouSenders = new Set();
  for (const { timestamp, sender, text: body, marked } of parsed) {
    if (!sender || (marked && isMarkedEvent(sender, body, realSenders))) {
      raw.push(makeMessage({ timestamp, content: body, type: 'System' }));
      continue;
    }

    const fields = interpretBody(body);
    if (fields.deletedByYou) deletedByYouSenders.add(sender);
    delete fields.deletedByYou;
    raw.push(makeMessage({ timestamp, sender, ...fields }));
  }

  const messages = finalizeMessages(raw);
  const participants = [...new Set(messages.filter((x) => x.type !== 'System').map((x) => x.sender))];

  // "You deleted this message" is only ever written for your own messages
  let you = '';
  let youConfident = false;
  if (deletedByYouSenders.size === 1) {
    [you] = deletedByYouSenders;
    youConfident = true;
  } else {
    you = mostFrequentSender(messages.filter((x) => x.type !== 'System'), participants[0] || '');
  }

  let chatTitle = title;
  if (!chatTitle) {
    chatTitle = participants.length === 2 && youConfident
      ? participants.find((p) => p !== you)
      : participants.join(', ');
  }

  return {
    platform: 'whatsapp',
    title: chatTitle || 'WhatsApp Chat',
    participants,
    you,
    youConfident,
    messages,
  };
}

/**
 * Extracts a title from WhatsApp's export filename, e.g.
 * "WhatsApp Chat with Alice.txt" / "WhatsApp Chat - Alice.zip" -> "Alice".
 */
export function titleFromFilename(name) {
  const base = name.replace(/^.*[\\/]/, '').replace(/\.(txt|zip)$/i, '');
  const m = base.match(/^WhatsApp Chat(?: with| -)\s+(.+)$/i);
  return m ? m[1].trim() : '';
}
