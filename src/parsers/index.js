/**
 * Import entry point: detects each file's platform and dispatches to the
 * right parser.
 *
 * Supports:
 *   - Instagram JSON exports (message_*.json, possibly several per thread)
 *   - Snapchat JSON exports (chat_history.json, many conversations)
 *   - WhatsApp "Export chat" .txt, or the .zip that bundles media
 *
 * Every chat is normalized to:
 *   { id, title, platform, participants, you, youConfident, messages, media }
 * where `media` is an array of { name, blob } (WhatsApp zips only).
 */

import { isInstagramExport, parseInstagram } from './instagram.js';
import { isSnapchatExport, parseSnapchat } from './snapchat.js';
import { looksLikeWhatsApp, parseWhatsApp, titleFromFilename } from './whatsapp.js';
import { chatId, mimeFor } from './common.js';
import { openZip } from './zip.js';

const UNRECOGNIZED =
  'Unrecognized file format. Upload an Instagram (message_*.json), Snapchat (chat_history.json) or WhatsApp (.txt / .zip) export.';

/**
 * Unpacks a WhatsApp export zip into its chat text and media blobs.
 * Entries are read one at a time, so memory stays bounded for huge exports.
 */
async function readWhatsAppZip(name, blob) {
  let entries;
  try {
    entries = await openZip(blob);
  } catch (err) {
    throw new Error(`${name}: ${err.message}.`, { cause: err });
  }
  const files = entries.filter((e) => !e.name.endsWith('/') && !e.name.includes('__MACOSX'));

  const chatFile =
    files.find((e) => /(^|\/)(_chat|WhatsApp Chat.*)\.txt$/i.test(e.name)) ||
    files.find((e) => e.name.toLowerCase().endsWith('.txt'));
  if (!chatFile) {
    throw new Error(`${name}: no chat .txt file found inside the zip.`);
  }

  const text = await (await chatFile.blob()).text();
  const media = [];
  for (const entry of files) {
    if (entry === chatFile) continue;
    const base = entry.name.replace(/^.*\//, '');
    try {
      media.push({ name: base, blob: await entry.blob(mimeFor(base)) });
    } catch {
      // Unreadable attachment (encrypted, unsupported method): the message
      // still shows, with a placeholder instead of the file
    }
  }

  return { text, media };
}

/**
 * @param {Array<{ name: string, text?: string, blob?: Blob }>} files - The
 *   user's Files as `blob`; tests may pass `text` directly
 * @param {object} [opts]
 * @param {string} [opts.locale] - Fallback for ambiguous WhatsApp dates
 * @returns {Promise<object[]>} chats
 */
export async function parseImport(files, { locale } = {}) {
  const instagram = [];
  const snapchat = [];
  const chats = [];

  for (const file of files) {
    const lower = file.name.toLowerCase();

    if (lower.endsWith('.zip')) {
      const zip = await readWhatsAppZip(file.name, file.blob);
      const chat = parseWhatsApp(zip.text, { title: titleFromFilename(file.name), locale });
      chat.media = zip.media;
      chats.push(chat);
      continue;
    }

    const text = file.text ?? (await file.blob.text());

    if (lower.endsWith('.txt')) {
      if (!looksLikeWhatsApp(text)) {
        throw new Error(`${file.name}: not a WhatsApp chat export.`);
      }
      chats.push(parseWhatsApp(text, { title: titleFromFilename(file.name), locale }));
      continue;
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`${file.name}: invalid JSON.`);
    }

    if (isInstagramExport(data)) instagram.push(data);
    else if (isSnapchatExport(data)) snapchat.push(data);
    else throw new Error(`${file.name}: ${UNRECOGNIZED}`);
  }

  if (instagram.length) chats.push(...parseInstagram(instagram));
  if (snapchat.length) chats.push(...parseSnapchat(snapchat));

  const nonEmpty = chats.filter((c) => c.messages.length > 0);
  if (nonEmpty.length === 0) {
    throw new Error('No messages found in the selected files.');
  }

  for (const chat of nonEmpty) {
    chat.id = chatId(chat);
    chat.media ||= [];
  }
  return nonEmpty;
}
