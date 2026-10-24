/**
 * Snapchat chat_history.json parser.
 *
 * Schema (real format):
 * {
 *   "username_of_friend": [
 *     {
 *       "From": "sender_username",
 *       "Media Type": "TEXT" | "MEDIA" | "STATUS" | "STICKER",
 *       "Created": "2026-10-03 15:34:15 UTC",
 *       "Content": "message text" | null,
 *       "Conversation Title": null | string,
 *       "IsSender": true | false,
 *       "Created(microseconds)": 1791041655201,
 *       "IsSaved": false,
 *       "Media IDs": ""
 *     }, ...
 *   ]
 * }
 *
 * Notes:
 * - Top-level keys are the conversation partner's username (or a group id).
 * - Older exports are a flat array of messages.
 * - Despite its name, "Created(microseconds)" is milliseconds in current
 *   exports; we detect the unit by magnitude.
 * - Every conversation becomes its own chat.
 */

import { makeMessage, finalizeMessages } from './common.js';

// Index of the uploaded file a raw message came from (see dedupeMessages)
const SOURCE = Symbol('source');

function isSnapMessage(msg) {
  return (
    !!msg &&
    typeof msg === 'object' &&
    'From' in msg &&
    ('Created' in msg || 'Created(microseconds)' in msg)
  );
}

/**
 * Extracts { partner, messages } conversations from a parsed export.
 */
export function extractSnapchatConversations(data) {
  if (Array.isArray(data)) {
    return data.length > 0 && isSnapMessage(data[0])
      ? [{ partner: 'Unknown', messages: data }]
      : [];
  }

  const conversations = [];
  if (!data || typeof data !== 'object') return conversations;

  for (const [key, val] of Object.entries(data)) {
    if (Array.isArray(val) && val.length > 0 && isSnapMessage(val[0])) {
      conversations.push({ partner: key, messages: val });
    }
  }
  return conversations;
}

export function isSnapchatExport(data) {
  return extractSnapchatConversations(data).length > 0;
}

export function getSnapTimestamp(msg) {
  const precise = msg['Created(microseconds)'];
  if (typeof precise === 'number' && precise > 0) {
    // > 1e14 can only be microseconds (1e14 ms is year 5138)
    return precise > 1e14 ? Math.floor(precise / 1000) : precise;
  }
  if (msg.Created) {
    const isoStr = msg.Created.replace(' UTC', 'Z').replace(' ', 'T');
    const ms = new Date(isoStr).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }
  return 0;
}

function normalizeMessage(msg) {
  const mediaType = msg['Media Type'] || '';
  const isErased = msg.Status === 'STATUSERASEDMESSAGE' || mediaType === 'NULL';

  let content = msg.Content || '';
  if (mediaType === 'MEDIA' || mediaType === 'IMAGE' || mediaType === 'VIDEO') {
    const lower = content.toLowerCase();
    if (lower === 'sent an image' || lower === 'sent a video') content = '';
  }

  return makeMessage({
    sender: msg.From,
    timestamp: getSnapTimestamp(msg),
    content,
    type: mediaType.startsWith('STATUS') && !content ? 'System' : 'Generic',
    photos: mediaType === 'IMAGE' || mediaType === 'MEDIA' ? [{ uri: '' }] : [],
    videos: mediaType === 'VIDEO' ? [{ uri: '' }] : [],
    audioFiles: mediaType === 'AUDIO' ? [{ uri: '' }] : [],
    sticker: mediaType === 'STICKER' ? { uri: '' } : null,
    isUnsent: isErased,
    source: msg[SOURCE],
  });
}

function parseConversation({ partner, messages: rawAll }) {
  const raw = rawAll.filter((msg) => msg && msg.From);
  if (raw.length === 0) return null;

  // IsSender is authoritative when present
  let you = raw.find((m) => m.IsSender === true)?.From || '';
  const youConfident = !!you;
  if (!you) you = raw.find((m) => m.From !== partner)?.From || 'You';

  const groupTitle = raw.find((m) => m['Conversation Title'])?.['Conversation Title'];
  const senders = [...new Set(raw.map((m) => m.From))];
  const participants = [you, ...senders.filter((s) => s !== you)];
  if (!participants.includes(partner) && !groupTitle) participants.push(partner);

  const messages = finalizeMessages(
    raw.map(normalizeMessage).filter((m) => m.type !== 'System' || m.content),
  );

  return {
    platform: 'snapchat',
    title: groupTitle || partner,
    participants,
    you,
    youConfident,
    messages,
  };
}

/**
 * @param {Array<object|Array>} exports - Parsed JSON values
 * @returns {object[]} chats -- one per conversation
 */
export function parseSnapchat(exports) {
  const byPartner = new Map();
  for (const [source, data] of exports.entries()) {
    for (const conv of extractSnapchatConversations(data)) {
      const tagged = conv.messages.map((msg) => (msg && typeof msg === 'object' ? { ...msg, [SOURCE]: source } : msg));
      const existing = byPartner.get(conv.partner);
      if (existing) existing.messages.push(...tagged);
      else byPartner.set(conv.partner, { partner: conv.partner, messages: tagged });
    }
  }

  return [...byPartner.values()]
    .map(parseConversation)
    .filter((c) => c && c.messages.length > 0)
    .sort((a, b) => b.messages.length - a.messages.length);
}
