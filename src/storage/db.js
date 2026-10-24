/**
 * Encrypted local persistence in IndexedDB. Nothing here ever leaves the
 * browser, and nothing readable is written to disk: chat metadata, messages
 * and media are all AES-GCM encrypted with a key derived from the user's
 * passphrase (see crypto.js). Storage keys are HMACs, not chat names.
 *
 * Stores (v2):
 *   vault     'config' -> { salt, iterations, verifier }
 *   echats    chatKey -> enc({ id, title, platform, participants, you, ... })
 *   emessages chatKey -> enc(messages[])
 *   emedia    [chatKey, nameKey] -> enc(bytes)
 *
 * v1 stores (chats, messages, media) held plaintext. They are kept only so
 * their contents can be migrated into the vault, then emptied.
 *
 * IMPORTANT: IndexedDB transactions auto-commit when awaiting anything that
 * isn't an IDB request, so all crypto happens before/after transactions.
 */

import { openDB } from 'idb';
import {
  createVaultConfig,
  unlockVault,
  encryptJSON,
  decryptJSON,
  encryptBytes,
  decryptBytes,
  opaqueKey,
} from './crypto.js';
import { mimeFor } from '../parsers/common.js';

const DB_NAME = 'chatviz';
const DB_VERSION = 2;
const LEGACY = ['chats', 'messages', 'media'];
const ENCRYPTED = ['echats', 'emessages', 'emedia'];

let dbPromise = null;
let keys = null; // { aesKey, hmacKey } while unlocked

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const name of ['vault', ...ENCRYPTED]) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        }
      },
    }).catch((err) => {
      dbPromise = null; // allow retry
      throw err;
    });
  }
  return dbPromise;
}

/** Closes the connection (tests, and before deleting the database). */
export async function closeDB() {
  if (dbPromise) (await dbPromise.catch(() => null))?.close();
  dbPromise = null;
  keys = null;
}

function requireKeys() {
  if (!keys) throw new Error('Storage is locked.');
  return keys;
}

/** Key range covering every media entry of one chat. */
function mediaRange(chatKey) {
  // Arrays sort after strings, so [key, []] is above every [key, name]
  return IDBKeyRange.bound([chatKey], [chatKey, []]);
}

const chatKeyFor = (id) => opaqueKey(requireKeys().hmacKey, `chat:${id}`);
const mediaKeyFor = (id, name) => opaqueKey(requireKeys().hmacKey, `media:${id}/${name}`);

// ---------------------------------------------------------------------------
// Vault lifecycle
// ---------------------------------------------------------------------------

async function legacyCount(db) {
  if (!db.objectStoreNames.contains('chats')) return 0;
  return db.count('chats');
}

/**
 * @returns {Promise<{ exists: boolean, unlocked: boolean, legacyChats: number }>}
 */
export async function getVaultStatus() {
  const db = await getDB();
  const [config, legacyChats] = await Promise.all([db.get('vault', 'config'), legacyCount(db)]);
  return { exists: !!config, unlocked: !!keys, legacyChats };
}

/**
 * Creates the vault with a new passphrase and encrypts any plaintext data
 * left over from v1.
 */
export async function createVault(passphrase) {
  const db = await getDB();
  if (await db.get('vault', 'config')) throw new Error('A passphrase is already set.');
  const { config, keys: newKeys } = await createVaultConfig(passphrase);
  await db.put('vault', config, 'config');
  keys = newKeys;
  await migrateLegacy();
}

/**
 * @returns {Promise<boolean>} false if the passphrase is wrong
 */
export async function unlock(passphrase) {
  const db = await getDB();
  const config = await db.get('vault', 'config');
  if (!config) throw new Error('No passphrase has been set yet.');
  const unlocked = await unlockVault(config, passphrase);
  if (!unlocked) return false;
  keys = unlocked;
  await migrateLegacy();
  return true;
}

export function lock() {
  keys = null;
}

export function isUnlocked() {
  return !!keys;
}

/**
 * Forgotten passphrase: the data can't be recovered, so erase everything.
 */
export async function resetVault() {
  const db = await getDB();
  const names = ['vault', ...ENCRYPTED, ...LEGACY].filter((n) => db.objectStoreNames.contains(n));
  const tx = db.transaction(names, 'readwrite');
  await Promise.all(names.map((n) => tx.objectStore(n).clear()));
  await tx.done;
  keys = null;
}

/**
 * Moves v1 plaintext chats into the vault, then deletes the plaintext.
 */
async function migrateLegacy() {
  const db = await getDB();
  if ((await legacyCount(db)) === 0) return;

  const tx = db.transaction(LEGACY, 'readonly');
  const [metas, messageRecords, mediaRecords] = await Promise.all([
    tx.objectStore('chats').getAll(),
    tx.objectStore('messages').getAll(),
    tx.objectStore('media').getAll(),
  ]);
  await tx.done;

  for (const meta of metas) {
    const messages = messageRecords.find((r) => r.chatId === meta.id)?.messages || [];
    const media = mediaRecords
      .filter((r) => r.chatId === meta.id)
      .map((r) => ({ name: r.name, blob: r.blob }));
    await saveChat({ ...meta, messages, media });
  }

  const wipe = db.transaction(LEGACY, 'readwrite');
  await Promise.all(LEGACY.map((n) => wipe.objectStore(n).clear()));
  await wipe.done;
}

// ---------------------------------------------------------------------------
// Chats
// ---------------------------------------------------------------------------

async function readMeta(db, chatKey) {
  const record = await db.get('echats', chatKey);
  return record ? decryptJSON(requireKeys().aesKey, record, `chat:${chatKey}`) : null;
}

/**
 * Asks the browser not to evict our data under storage pressure.
 * Chrome grants this silently for engaged sites; Firefox may prompt.
 */
async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    // Not fatal -- data is still stored, just "best effort"
  }
}

// Media is encrypted and written in batches of about this size, so memory
// stays bounded however large the export is
const MEDIA_BATCH_BYTES = 16 * 1024 * 1024;

/**
 * Encrypts and writes a chat's media in batches.
 *
 * @returns {Promise<Set<string>>} the name keys written
 */
async function saveMedia(db, chat, chatKey, onProgress) {
  const { aesKey } = requireKeys();
  const media = chat.media || [];
  const written = new Set();
  let batch = [];
  let batchBytes = 0;

  const flush = async () => {
    const tx = db.transaction('emedia', 'readwrite');
    await Promise.all(batch.map(({ key, value }) => tx.store.put(value, key)));
    await tx.done;
    batch = [];
    batchBytes = 0;
    onProgress?.(written.size, media.length);
  };

  for (const m of media) {
    const nameKey = await mediaKeyFor(chat.id, m.name);
    const bytes = await m.blob.arrayBuffer();
    batch.push({ key: [chatKey, nameKey], value: await encryptBytes(aesKey, bytes, `media:${chatKey}/${nameKey}`) });
    written.add(nameKey);
    batchBytes += bytes.byteLength;
    if (batchBytes >= MEDIA_BATCH_BYTES) await flush();
  }
  if (batch.length > 0 || media.length === 0) await flush();
  return written;
}

/**
 * Saves (or replaces) a parsed chat including its media.
 * Re-importing the same chat keeps the user's "you" choice.
 *
 * Media is written first, in batches; the chat itself only appears (or is
 * replaced) once everything is stored. Media slots are keyed by file name,
 * so a replace that fails halfway leaves the previous version readable.
 *
 * @param {object} chat
 * @param {object} [opts]
 * @param {(done: number, total: number) => void} [opts.onProgress] - Media files saved so far
 */
export async function saveChat(chat, { onProgress } = {}) {
  const { aesKey } = requireKeys();
  const db = await getDB();
  const chatKey = await chatKeyFor(chat.id);
  const { messages } = chat;
  const media = chat.media || [];

  const meta = {
    id: chat.id,
    title: chat.title,
    platform: chat.platform,
    participants: chat.participants,
    you: chat.you,
    youConfident: chat.youConfident,
    importedAt: Date.now(),
    messageCount: messages.length,
    firstTs: messages[0]?.timestamp ?? null,
    lastTs: messages[messages.length - 1]?.timestamp ?? null,
    mediaCount: media.length,
    mediaNames: media.map((m) => m.name),
  };

  const existing = await readMeta(db, chatKey).catch(() => null);
  if (existing?.youConfident && chat.participants.includes(existing.you)) {
    meta.you = existing.you;
    meta.youConfident = true;
  }

  const written = await saveMedia(db, chat, chatKey, onProgress);

  // Encrypt before opening the transaction (see note at top of file)
  const [encMeta, encMessages] = await Promise.all([
    encryptJSON(aesKey, meta, `chat:${chatKey}`),
    encryptJSON(aesKey, messages, `messages:${chatKey}`),
  ]);

  const tx = db.transaction(ENCRYPTED, 'readwrite');
  const mediaStore = tx.objectStore('emedia');
  const stale = (await mediaStore.getAllKeys(mediaRange(chatKey))).filter(([, nameKey]) => !written.has(nameKey));
  await Promise.all([
    tx.objectStore('echats').put(encMeta, chatKey),
    tx.objectStore('emessages').put(encMessages, chatKey),
    ...stale.map((key) => mediaStore.delete(key)),
  ]);
  await tx.done;

  requestPersistence();
  return meta;
}

export async function listChats() {
  const { aesKey } = requireKeys();
  const db = await getDB();
  const tx = db.transaction('echats', 'readonly');
  const [chatKeys, records] = await Promise.all([tx.store.getAllKeys(), tx.store.getAll()]);
  await tx.done;

  const metas = await Promise.all(
    records.map((r, i) => decryptJSON(aesKey, r, `chat:${chatKeys[i]}`).catch(() => null)),
  );
  return metas.filter(Boolean).sort((a, b) => (b.lastTs ?? 0) - (a.lastTs ?? 0));
}

/**
 * @returns {Promise<{ meta, messages, mediaNames: Set<string> } | null>}
 */
export async function loadChat(id) {
  const { aesKey } = requireKeys();
  const db = await getDB();
  const chatKey = await chatKeyFor(id);

  const tx = db.transaction(['echats', 'emessages'], 'readonly');
  const [metaRecord, messagesRecord] = await Promise.all([
    tx.objectStore('echats').get(chatKey),
    tx.objectStore('emessages').get(chatKey),
  ]);
  await tx.done;
  if (!metaRecord || !messagesRecord) return null;

  const [meta, messages] = await Promise.all([
    decryptJSON(aesKey, metaRecord, `chat:${chatKey}`),
    decryptJSON(aesKey, messagesRecord, `messages:${chatKey}`),
  ]);
  return { meta, messages, mediaNames: new Set(meta.mediaNames || []) };
}

export async function getMediaBlob(chatId, name) {
  const { aesKey } = requireKeys();
  const db = await getDB();
  const chatKey = await chatKeyFor(chatId);
  const nameKey = await mediaKeyFor(chatId, name);
  const record = await db.get('emedia', [chatKey, nameKey]);
  if (!record) return null;
  const bytes = await decryptBytes(aesKey, record, `media:${chatKey}/${nameKey}`);
  return new Blob([bytes], { type: mimeFor(name) });
}

export async function updateYou(chatId, you) {
  const { aesKey } = requireKeys();
  const db = await getDB();
  const chatKey = await chatKeyFor(chatId);
  const meta = await readMeta(db, chatKey);
  if (!meta) return;
  meta.you = you;
  meta.youConfident = true;
  await db.put('echats', await encryptJSON(aesKey, meta, `chat:${chatKey}`), chatKey);
}

export async function deleteChat(id) {
  const db = await getDB();
  const chatKey = await chatKeyFor(id);
  const tx = db.transaction(ENCRYPTED, 'readwrite');
  await Promise.all([
    tx.objectStore('echats').delete(chatKey),
    tx.objectStore('emessages').delete(chatKey),
    tx.objectStore('emedia').delete(mediaRange(chatKey)),
  ]);
  await tx.done;
}

/** Deletes all chats but keeps the passphrase. */
export async function clearAll() {
  const db = await getDB();
  const tx = db.transaction(ENCRYPTED, 'readwrite');
  await Promise.all(ENCRYPTED.map((n) => tx.objectStore(n).clear()));
  await tx.done;
}

/**
 * @returns {Promise<{ usage: number, quota: number, persisted: boolean } | null>}
 */
export async function getStorageEstimate() {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  const persisted = (await navigator.storage.persisted?.()) ?? false;
  return { usage, quota, persisted };
}
