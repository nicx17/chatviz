/**
 * Instagram JSON export parser (message_*.json).
 *
 * Schema (per file):
 * {
 *   "participants": [{ "name": "..." }, ...],
 *   "messages": [
 *     {
 *       "sender_name": "...",
 *       "timestamp_ms": 1696300000000,
 *       "content": "...",
 *       "type": "Generic" | "Share" | "Call",
 *       "reactions": [{ "reaction": "...", "actor": "..." }],
 *       "photos": [{ "uri": "..." }],
 *       "videos": [{ "uri": "..." }],
 *       "audio_files": [{ "uri": "..." }],
 *       "share": { "link": "...", "share_text": "..." },
 *       "sticker": { "uri": "..." },
 *       "replied_to": { "sender_name": "...", "content": "..." },
 *       "is_unsent": true | undefined,
 *       "call_duration": 0 | n,
 *     }
 *   ],
 *   "title": "...",
 * }
 *
 * A long conversation is split across message_1.json, message_2.json, ...
 * Files are grouped into threads by their participant list, so uploading
 * several different conversations at once yields several chats.
 */

import { makeMessage, finalizeMessages, mostFrequentSender } from './common.js';

/**
 * Fixes Instagram's Latin-1-over-UTF-8 encoding bug.
 *
 * Instagram's data export tool reads raw UTF-8 bytes and writes each byte
 * as a JSON \uXXXX escape in the Latin-1 (ISO-8859-1) range. For example,
 * the emoji (U+1F602) which is 4 UTF-8 bytes (F0 9F 98 82) becomes the
 * JSON string "ð\u009f\u0098\u0082".
 *
 * This function reverses that process by:
 *  1. Converting each JS char back to its byte value (charCodeAt).
 *  2. Packing those bytes into a Uint8Array.
 *  3. Decoding the byte array with TextDecoder('utf-8').
 *
 * @param {string} text - The mis-encoded string from Instagram JSON.
 * @returns {string} - Correctly decoded UTF-8 string.
 */
export function fixEncoding(text) {
  if (!text) return '';

  // Quick check: if all chars are in 0x00-0xFF range, it might be
  // mis-encoded. If we see chars > 0xFF, it's already proper Unicode.
  let needsFix = false;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 255) return text;
    if (code > 127) needsFix = true;
  }

  if (!needsFix) return text;

  try {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      bytes[i] = text.charCodeAt(i);
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return text; // Not valid UTF-8 bytes -- the text was fine as-is
  }
}

export function isInstagramExport(data) {
  return !!data && !Array.isArray(data) && typeof data === 'object' && Array.isArray(data.messages);
}

// Instagram writes reaction *notifications* as ordinary messages. They don't
// say which message was reacted to, so they're shown as compact events.
const REACTION_RE = /^Reacted (.+?) to your message\s*$/;
const LIKED_RE = /^Liked a message\s*$/;

/**
 * Classifies Instagram's auto-generated message texts.
 *
 * @returns {{ type: string, content: string, reaction?: string }}
 */
export function classifyInstagramContent(content, sender, hasShare) {
  const reacted = content.match(REACTION_RE);
  if (reacted) return { type: 'Reaction', content: '', reaction: reacted[1] };
  if (LIKED_RE.test(content)) return { type: 'Reaction', content: '', reaction: '❤️' };

  // "Alex sent an attachment." duplicates the share card it accompanies
  if (hasShare && /^.+ sent an attachment\.?$/.test(content) && content.startsWith(sender)) {
    return { type: 'Share', content: '' };
  }
  return { type: null, content };
}

function normalizeMessage(msg, source) {
  const sender = fixEncoding(msg.sender_name);
  const classified = classifyInstagramContent(fixEncoding(msg.content || ''), sender, !!msg.share);

  return makeMessage({
    sender,
    timestamp: msg.timestamp_ms,
    content: classified.content,
    type: classified.type || msg.type || 'Generic',
    reaction: classified.reaction,
    reactions: (msg.reactions || []).map((r) => ({
      emoji: fixEncoding(r.reaction),
      actor: fixEncoding(r.actor),
    })),
    photos: msg.photos || [],
    videos: msg.videos || [],
    audioFiles: msg.audio_files || [],
    share: msg.share
      ? {
          link: msg.share.link || '',
          text: fixEncoding(msg.share.share_text || ''),
        }
      : null,
    sticker: msg.sticker || null,
    repliedTo: msg.replied_to
      ? {
          sender: fixEncoding(msg.replied_to.sender_name || ''),
          content: fixEncoding(msg.replied_to.content || ''),
        }
      : null,
    isUnsent: !!msg.is_unsent,
    callDuration: msg.call_duration,
    isCall: msg.type === 'Call',
    source,
  });
}

/**
 * Parses one or more already-JSON.parse'd Instagram export objects.
 *
 * @param {object[]} exports
 * @returns {object[]} chats
 */
export function parseInstagram(exports) {
  // Group files into threads by participant set
  const threads = new Map();
  for (const [source, raw] of exports.entries()) {
    const participants = (raw.participants || []).map((p) => fixEncoding(p.name));
    const key = [...participants].sort().join('\u0000');
    if (!threads.has(key)) {
      threads.set(key, {
        participants,
        title: fixEncoding(raw.title || '') || participants.join(', '),
        unsorted: [],
      });
    }
    threads.get(key).unsorted.push(...(raw.messages || []).map((msg) => normalizeMessage(msg, source)));
  }

  const chats = [];
  for (const { participants, title, unsorted } of threads.values()) {
    const messages = finalizeMessages(unsorted);
    const allPeople = participants.length > 0
      ? participants
      : [...new Set(messages.map((m) => m.sender))];

    // In a 1:1 thread Instagram sets the title to the *other* person's name,
    // so "you" is the participant who isn't the title.
    const youConfident = allPeople.length === 2 && allPeople.includes(title);
    const you = youConfident
      ? allPeople.find((p) => p !== title)
      : mostFrequentSender(messages, allPeople[0] || '');

    chats.push({
      platform: 'instagram',
      title,
      participants: allPeople,
      you,
      youConfident,
      messages,
    });
  }

  // With several threads, the one person present in all of them is you.
  if (chats.length > 1) {
    const common = chats
      .map((c) => new Set(c.participants))
      .reduce((a, b) => new Set([...a].filter((p) => b.has(p))));
    if (common.size === 1) {
      const [you] = common;
      for (const chat of chats) {
        chat.you = you;
        chat.youConfident = true;
      }
    }
  }

  return chats;
}
