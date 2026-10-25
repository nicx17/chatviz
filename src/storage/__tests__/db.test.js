import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getVaultStatus,
  createVault,
  unlock,
  lock,
  resetVault,
  saveChat,
  listChats,
  loadChat,
  getMediaBlob,
  updateYou,
  deleteChat,
  clearAll,
  closeDB,
} from '../db.js';

const PASS = 'correct horse battery';

function makeChat(overrides = {}) {
  return {
    id: 'whatsapp-abc123',
    title: 'Alice Secretname',
    platform: 'whatsapp',
    participants: ['Me', 'Alice Secretname'],
    you: 'Me',
    youConfident: false,
    messages: [
      { id: 0, sender: 'Alice Secretname', timestamp: 1000, content: 'the launch code is 0000', type: 'Generic' },
      { id: 1, sender: 'Me', timestamp: 2000, content: 'noted', type: 'Generic' },
    ],
    media: [{ name: 'IMG-0001.jpg', blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0x42])]) }],
    ...overrides,
  };
}

/** Dumps every key and value in the database as text, for leak checks. */
async function dumpRawDatabase() {
  const db = await openDB('chatviz');
  const out = [];
  const dec = new TextDecoder();
  const toText = (v) => {
    if (v instanceof ArrayBuffer) return dec.decode(v);
    if (ArrayBuffer.isView(v)) return dec.decode(v);
    if (Array.isArray(v)) return v.map(toText).join(' ');
    if (v && typeof v === 'object') return Object.values(v).map(toText).join(' ');
    return String(v);
  };
  for (const name of db.objectStoreNames) {
    const keys = await db.getAllKeys(name);
    const values = await db.getAll(name);
    out.push(name, ...keys.map(toText), ...values.map(toText));
  }
  db.close();
  return out.join('\n');
}

beforeEach(async () => {
  await closeDB();
  globalThis.indexedDB = new IDBFactory();
});

describe('encrypted storage', () => {
  it('starts without a vault', async () => {
    expect(await getVaultStatus()).toEqual({ exists: false, unlocked: false, legacyChats: 0 });
  });

  it('refuses to save while locked', async () => {
    await expect(saveChat(makeChat())).rejects.toThrow(/locked/);
  });

  it('saves, lists and loads a chat with media', async () => {
    await createVault(PASS);
    await saveChat(makeChat());

    const [meta] = await listChats();
    expect(meta).toMatchObject({ id: 'whatsapp-abc123', title: 'Alice Secretname', messageCount: 2, mediaCount: 1 });

    const loaded = await loadChat('whatsapp-abc123');
    expect(loaded.messages[0].content).toBe('the launch code is 0000');
    expect([...loaded.mediaNames]).toEqual(['IMG-0001.jpg']);

    const blob = await getMediaBlob('whatsapp-abc123', 'IMG-0001.jpg');
    expect(blob.type).toBe('image/jpeg');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff, 0x42]));
  });

  it('stores nothing readable: no names, messages, ids or filenames', async () => {
    await createVault(PASS);
    await saveChat(makeChat());
    const raw = await dumpRawDatabase();
    for (const secret of ['Secretname', 'launch code', 'whatsapp-abc123', 'IMG-0001', 'noted']) {
      expect(raw).not.toContain(secret);
    }
  });

  it('locks and unlocks', async () => {
    await createVault(PASS);
    await saveChat(makeChat());
    lock();
    expect((await getVaultStatus()).unlocked).toBe(false);
    await expect(listChats()).rejects.toThrow(/locked/);

    await expect(loadChat('whatsapp-abc123')).rejects.toThrow(/locked/);
    await expect(getMediaBlob('whatsapp-abc123', 'IMG-0001.jpg')).rejects.toThrow(/locked/);
    await expect(updateYou('whatsapp-abc123', 'x')).rejects.toThrow(/locked/);
    await expect(deleteChat('whatsapp-abc123')).rejects.toThrow(/locked/);

    expect(await unlock('wrong passphrase')).toBe(false);
    expect((await getVaultStatus()).unlocked).toBe(false);
    expect(await unlock(PASS)).toBe(true);
    expect(await listChats()).toHaveLength(1);
  });

  it('survives closing and reopening the database', async () => {
    await createVault(PASS);
    await saveChat(makeChat());
    await closeDB(); // simulates a page reload: connection and keys gone
    expect(await getVaultStatus()).toMatchObject({ exists: true, unlocked: false });
    await unlock(PASS);
    expect((await loadChat('whatsapp-abc123')).messages).toHaveLength(2);
  });

  it('cannot create a second vault', async () => {
    await createVault(PASS);
    await expect(createVault('other')).rejects.toThrow(/already/);
  });

  it('re-importing replaces the chat and keeps the chosen "you"', async () => {
    await createVault(PASS);
    await saveChat(makeChat());
    await updateYou('whatsapp-abc123', 'Alice Secretname');

    const saved = await saveChat(makeChat({ media: [] }));
    expect(saved.you).toBe('Alice Secretname');
    const list = await listChats();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ you: 'Alice Secretname', youConfident: true, mediaCount: 0 });
    // Old media was removed with the replace
    expect(await getMediaBlob('whatsapp-abc123', 'IMG-0001.jpg')).toBeNull();
  });

  it('re-importing keeps media that is still there and drops what is gone', async () => {
    await createVault(PASS);
    const file = (name, byte) => ({ name, blob: new Blob([new Uint8Array([byte])]) });
    await saveChat(makeChat({ media: [file('a.jpg', 1), file('b.jpg', 2)] }));
    await saveChat(makeChat({ media: [file('b.jpg', 3), file('c.jpg', 4)] }));

    expect(await getMediaBlob('whatsapp-abc123', 'a.jpg')).toBeNull();
    const b = await getMediaBlob('whatsapp-abc123', 'b.jpg');
    expect(new Uint8Array(await b.arrayBuffer())).toEqual(new Uint8Array([3]));
    expect(await getMediaBlob('whatsapp-abc123', 'c.jpg')).not.toBeNull();
  });

  it('saves large media in batches and reports progress', async () => {
    await createVault(PASS);
    const mb = 1024 * 1024;
    const media = Array.from({ length: 5 }, (_, i) => ({
      name: `VID-${i}.mp4`,
      blob: new Blob([new Uint8Array(9 * mb).fill(i)]),
    }));
    const progress = [];
    await saveChat(makeChat({ media }), { onProgress: (done, total) => progress.push([done, total]) });

    // 45 MB of media can't go in one batch
    expect(progress.length).toBeGreaterThan(1);
    expect(progress.at(-1)).toEqual([5, 5]);
    expect(progress.map(([done]) => done)).toEqual(progress.map(([done]) => done).sort((x, y) => x - y));
    const last = await getMediaBlob('whatsapp-abc123', 'VID-4.mp4');
    expect(last.size).toBe(9 * mb);
  });

  it('deletes one chat with its media, clearAll keeps the passphrase', async () => {
    await createVault(PASS);
    await saveChat(makeChat());
    await saveChat(makeChat({ id: 'snapchat-xyz', title: 'Bob', participants: ['Me', 'Bob'] }));

    await deleteChat('whatsapp-abc123');
    expect((await listChats()).map((c) => c.id)).toEqual(['snapchat-xyz']);
    expect(await getMediaBlob('whatsapp-abc123', 'IMG-0001.jpg')).toBeNull();
    expect(await getMediaBlob('snapchat-xyz', 'IMG-0001.jpg')).not.toBeNull();

    await clearAll();
    expect(await listChats()).toEqual([]);
    expect((await getVaultStatus()).exists).toBe(true);
  });

  it('rejects ciphertext swapped between chats', async () => {
    await createVault(PASS);
    await saveChat(makeChat({ id: 'a' }));
    await saveChat(makeChat({ id: 'b' }));

    // Overwrite b's messages record with a's ciphertext
    const db = await openDB('chatviz');
    const keys = await db.getAllKeys('emessages');
    const aRecord = await db.get('emessages', keys[0]);
    await db.put('emessages', aRecord, keys[1]);
    db.close();

    const results = await Promise.allSettled([loadChat('a'), loadChat('b')]);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it('resetVault erases everything', async () => {
    await createVault(PASS);
    await saveChat(makeChat());
    await resetVault();
    expect(await getVaultStatus()).toEqual({ exists: false, unlocked: false, legacyChats: 0 });
    await createVault('new pass');
    expect(await listChats()).toEqual([]);
  });

  it('migrates plaintext v1 data into the vault and wipes the plaintext', async () => {
    // Recreate the v1 schema with plaintext data
    const v1 = await openDB('chatviz', 1, {
      upgrade(db) {
        db.createObjectStore('chats', { keyPath: 'id' });
        db.createObjectStore('messages', { keyPath: 'chatId' });
        db.createObjectStore('media', { keyPath: ['chatId', 'name'] });
      },
    });
    const chat = makeChat();
    await v1.put('chats', {
      id: chat.id, title: chat.title, platform: chat.platform, participants: chat.participants,
      you: chat.you, youConfident: true, messageCount: 2, firstTs: 1000, lastTs: 2000, mediaCount: 1,
    });
    await v1.put('messages', { chatId: chat.id, messages: chat.messages });
    await v1.put('media', { chatId: chat.id, name: 'IMG-0001.jpg', blob: chat.media[0].blob });
    v1.close();

    expect(await getVaultStatus()).toMatchObject({ exists: false, legacyChats: 1 });
    await createVault(PASS);

    expect(await getVaultStatus()).toMatchObject({ exists: true, legacyChats: 0 });
    const loaded = await loadChat(chat.id);
    expect(loaded.meta.you).toBe('Me');
    expect(loaded.messages[0].content).toBe('the launch code is 0000');
    expect(await getMediaBlob(chat.id, 'IMG-0001.jpg')).not.toBeNull();

    const raw = await dumpRawDatabase();
    expect(raw).not.toContain('launch code');
    expect(raw).not.toContain('Secretname');
  });
});
