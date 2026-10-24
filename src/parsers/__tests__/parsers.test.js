import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { parseImport } from '../index.js';
import { parseWhatsApp, detectDateOrder, titleFromFilename } from '../whatsapp.js';
import { fixEncoding, classifyInstagramContent } from '../instagram.js';
import { getSnapTimestamp } from '../snapchat.js';
import { formatDateHeader, findIndexAtOrAfter, computeStats, getBubblePosition } from '../../utils/layout.js';

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

describe('WhatsApp parser', () => {
  it('parses Android 12h format with multiline messages and system lines', () => {
    const text = [
      '31/12/23, 9:41\u202fPM - Messages and calls are end-to-end encrypted. No one outside of this chat can read them.',
      '31/12/23, 9:42\u202fPM - Alice: Happy new year!',
      'See you tomorrow',
      '31/12/23, 9:43\u202fPM - Bob: You too',
      '01/01/24, 12:05\u202fAM - Bob: IMG-20240101-WA0001.jpg (file attached)',
      'Fireworks!',
      '01/01/24, 12:06\u202fAM - Alice: <Media omitted>',
    ].join('\n');

    const chat = parseWhatsApp(text, { locale: 'en-GB' });
    expect(chat.platform).toBe('whatsapp');
    expect(chat.participants).toEqual(['Alice', 'Bob']);
    expect(chat.messages).toHaveLength(5);

    const [sys, alice, bob, photo, omitted] = chat.messages;
    expect(sys.type).toBe('System');
    expect(alice.content).toBe('Happy new year!\nSee you tomorrow');
    expect(new Date(alice.timestamp)).toEqual(new Date(2023, 11, 31, 21, 42));
    expect(bob.sender).toBe('Bob');
    expect(photo.photos).toEqual([{ uri: 'IMG-20240101-WA0001.jpg' }]);
    expect(photo.content).toBe('Fireworks!');
    expect(new Date(photo.timestamp)).toEqual(new Date(2024, 0, 1, 0, 5));
    expect(omitted.photos).toHaveLength(1);
    expect(omitted.content).toBe('');
  });

  it('parses iOS bracketed 24h format with seconds, LRM marks and attachments', () => {
    const text = [
      '[12/03/2024, 14:05:09] Alice: hi',
      '\u200e[12/03/2024, 14:06:10] Bob: \u200e<attached: 00000012-AUDIO-2024-03-12-14-06-10.opus>',
      '[25/03/2024, 08:00:00] Bob: This message was deleted',
      '[25/03/2024, 08:00:01] Alice: You deleted this message',
      '[25/03/2024, 08:00:02] Alice: edited text <This message was edited>',
    ].join('\n');

    const chat = parseWhatsApp(text, { locale: 'en-US' });
    // 25 in first field forces DMY despite en-US fallback
    expect(new Date(chat.messages[0].timestamp)).toEqual(new Date(2024, 2, 12, 14, 5, 9));
    expect(chat.messages[1].audioFiles).toEqual([{ uri: '00000012-AUDIO-2024-03-12-14-06-10.opus' }]);
    expect(chat.messages[2].isUnsent).toBe(true);
    expect(chat.messages[4].content).toBe('edited text');
    // "You deleted this message" identifies you
    expect(chat.you).toBe('Alice');
    expect(chat.youConfident).toBe(true);
  });

  it('detects month-first dates', () => {
    const text = '12/31/23, 21:41 - Alice: hi\n1/2/24, 08:00 - Bob: yo';
    const chat = parseWhatsApp(text, { locale: 'en-GB' });
    expect(new Date(chat.messages[0].timestamp)).toEqual(new Date(2023, 11, 31, 21, 41));
    expect(new Date(chat.messages[1].timestamp)).toEqual(new Date(2024, 0, 2, 8, 0));
  });

  it('detectDateOrder falls back to locale when ambiguous', () => {
    expect(detectDateOrder([[1, 2, 24]], 'en-US')).toBe('MDY');
    expect(detectDateOrder([[1, 2, 24]], 'de-DE')).toBe('DMY');
    expect(detectDateOrder([[2024, 1, 2]], 'en-US')).toBe('YMD');
  });

  it('extracts title from filename', () => {
    expect(titleFromFilename('WhatsApp Chat with Alice.txt')).toBe('Alice');
    expect(titleFromFilename('WhatsApp Chat - Team 🚀.zip')).toBe('Team 🚀');
    expect(titleFromFilename('_chat.txt')).toBe('');
  });

  it('imports a zip with media', async () => {
    const zip = zipSync({
      '_chat.txt': strToU8('[12/03/2024, 14:05:09] Alice: <attached: 00000001-PHOTO-2024-03-12.jpg>\n'),
      '00000001-PHOTO-2024-03-12.jpg': new Uint8Array([0xff, 0xd8, 0xff]),
    });
    const [chat] = await parseImport(
      [{ name: 'WhatsApp Chat - Alice.zip', blob: new Blob([zip]) }],
      { locale: 'en-GB' },
    );
    expect(chat.title).toBe('Alice');
    expect(chat.messages[0].photos[0].uri).toBe('00000001-PHOTO-2024-03-12.jpg');
    expect(chat.media).toHaveLength(1);
    expect(chat.media[0].name).toBe('00000001-PHOTO-2024-03-12.jpg');
    expect(chat.media[0].blob.type).toBe('image/jpeg');
  });

  it('rejects a random .txt', async () => {
    await expect(parseImport([{ name: 'notes.txt', text: 'hello world' }])).rejects.toThrow(/not a WhatsApp/);
  });

  it('keeps identical messages sent within the same minute', () => {
    // Android exports have minute precision, so bursts share a timestamp
    const text = [
      '31/12/23, 21:41 - Alice: IMG-20231231-WA0001.jpg (file attached)',
      '31/12/23, 21:41 - Alice: IMG-20231231-WA0002.jpg (file attached)',
      '31/12/23, 21:41 - Alice: IMG-20231231-WA0003.jpg (file attached)',
      '31/12/23, 21:42 - Bob: ok',
      '31/12/23, 21:42 - Bob: ok',
      '31/12/23, 21:43 - Bob: <Media omitted>',
      '31/12/23, 21:43 - Bob: <Media omitted>',
    ].join('\n');
    const chat = parseWhatsApp(text, { locale: 'en-GB' });
    expect(chat.messages).toHaveLength(7);
    expect(chat.messages.slice(0, 3).map((m) => m.photos[0].uri)).toEqual([
      'IMG-20231231-WA0001.jpg', 'IMG-20231231-WA0002.jpg', 'IMG-20231231-WA0003.jpg',
    ]);
  });

  it('treats iOS group events as system messages, not a participant', () => {
    // iOS writes group events as "<group name>: ‎<event>"
    const text = [
      '[31/12/23, 21:40:00] Family: ‎Messages and calls are end-to-end encrypted.',
      '[31/12/23, 21:40:05] Family: ‎Alice added Bob',
      '[31/12/23, 21:41:00] Alice: hi',
      '[31/12/23, 21:41:30] Bob: hey',
    ].join('\n');
    const chat = parseWhatsApp(text, { locale: 'en-GB' });
    expect(chat.participants).toEqual(['Alice', 'Bob']);
    expect(chat.messages.slice(0, 2).map((m) => [m.type, m.content])).toEqual([
      ['System', 'Messages and calls are end-to-end encrypted.'],
      ['System', 'Alice added Bob'],
    ]);
  });

  it('keeps marked iOS lines from real senders, except known notices', () => {
    const text = [
      '[31/12/23, 21:40:00] Alice: ‎Messages and calls are end-to-end encrypted.',
      '[31/12/23, 21:41:00] Alice: hi',
      '[31/12/23, 21:42:00] Alice: ‎Location: https://maps.google.com/?q=1,2',
      '[31/12/23, 21:43:00] Bob: hey',
    ].join('\n');
    const chat = parseWhatsApp(text, { locale: 'en-GB' });
    expect(chat.messages[0].type).toBe('System');
    expect(chat.messages[2]).toMatchObject({ type: 'Generic', sender: 'Alice', content: 'Location: https://maps.google.com/?q=1,2' });
  });

  it('does not mistake an Android event containing ": " for a sender', () => {
    const text = [
      '31/12/23, 21:40 - Alice changed the subject to "Trip: Rome"',
      '31/12/23, 21:41 - Alice: hi',
    ].join('\n');
    const chat = parseWhatsApp(text, { locale: 'en-GB' });
    expect(chat.participants).toEqual(['Alice']);
    expect(chat.messages[0]).toMatchObject({ type: 'System', content: 'Alice changed the subject to "Trip: Rome"' });
  });
});

// ---------------------------------------------------------------------------
// Zip reading
// ---------------------------------------------------------------------------

/**
 * Rewrites a small zip as Zip64: inserts a Zip64 end-of-central-directory
 * record + locator and saturates the classic EOCD fields.
 */
function toZip64(zip) {
  const eocdAt = zip.length - 22;
  const eocd = new DataView(zip.buffer, zip.byteOffset + eocdAt, 22);
  const entries = eocd.getUint16(10, true);
  const cdSize = eocd.getUint32(12, true);
  const cdOffset = eocd.getUint32(16, true);

  const rec = new DataView(new ArrayBuffer(56));
  rec.setUint32(0, 0x06064b50, true);
  rec.setBigUint64(4, 44n, true);
  rec.setBigUint64(24, BigInt(entries), true);
  rec.setBigUint64(32, BigInt(entries), true);
  rec.setBigUint64(40, BigInt(cdSize), true);
  rec.setBigUint64(48, BigInt(cdOffset), true);

  const loc = new DataView(new ArrayBuffer(20));
  loc.setUint32(0, 0x07064b50, true);
  loc.setBigUint64(8, BigInt(eocdAt), true);
  loc.setUint32(16, 1, true);

  const tail = new Uint8Array(zip.slice(eocdAt));
  const tailView = new DataView(tail.buffer);
  tailView.setUint16(8, 0xffff, true);
  tailView.setUint16(10, 0xffff, true);
  tailView.setUint32(12, 0xffffffff, true);
  tailView.setUint32(16, 0xffffffff, true);

  return new Blob([zip.slice(0, eocdAt), rec, loc, tail]);
}

describe('zip reading', () => {
  const chatTxt = strToU8([
    '[12/03/2024, 14:05:09] Alice: <attached: 00000001-PHOTO-2024-03-12.jpg>',
    '[12/03/2024, 14:05:10] Alice: <attached: 00000002-AUDIO-2024-03-12.opus>',
  ].join('\n'));
  const photo = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
  const audio = new Uint8Array(4096).map((_, i) => i % 7); // compressible

  it('reads stored and deflated entries in subfolders', async () => {
    const zip = zipSync({
      'Chat/_chat.txt': [chatTxt, { level: 6 }],
      'Chat/00000001-PHOTO-2024-03-12.jpg': [photo, { level: 0 }],
      'Chat/00000002-AUDIO-2024-03-12.opus': [audio, { level: 9 }],
      '__MACOSX/Chat/._00000001-PHOTO-2024-03-12.jpg': new Uint8Array([0]),
    });
    const [chat] = await parseImport([{ name: 'WhatsApp Chat - Alice.zip', blob: new Blob([zip]) }], { locale: 'en-GB' });

    expect(chat.messages).toHaveLength(2);
    expect(chat.media.map((m) => m.name).sort()).toEqual([
      '00000001-PHOTO-2024-03-12.jpg', '00000002-AUDIO-2024-03-12.opus',
    ]);
    const byName = Object.fromEntries(chat.media.map((m) => [m.name, m.blob]));
    expect(new Uint8Array(await byName['00000001-PHOTO-2024-03-12.jpg'].arrayBuffer())).toEqual(photo);
    expect(new Uint8Array(await byName['00000002-AUDIO-2024-03-12.opus'].arrayBuffer())).toEqual(audio);
    expect(byName['00000002-AUDIO-2024-03-12.opus'].type).toBe('audio/ogg');
  });

  it('reads Zip64 archives', async () => {
    const zip = zipSync({ '_chat.txt': chatTxt, '00000001-PHOTO-2024-03-12.jpg': [photo, { level: 0 }] });
    const [chat] = await parseImport([{ name: 'WhatsApp Chat - Alice.zip', blob: toZip64(zip) }], { locale: 'en-GB' });
    expect(chat.messages).toHaveLength(2);
    expect(chat.media).toHaveLength(1);
  });

  it('rejects a file that is not a zip', async () => {
    await expect(parseImport([{ name: 'x.zip', blob: new Blob(['not a zip']) }])).rejects.toThrow(/not a valid zip/);
  });
});

// ---------------------------------------------------------------------------
// Instagram
// ---------------------------------------------------------------------------

describe('Instagram parser', () => {
  const file = (participants, title, messages) =>
    JSON.stringify({ participants: participants.map((name) => ({ name })), title, messages });

  it('fixes mojibake', () => {
    expect(fixEncoding('Howâ\u0080\u0099s it going? ð\u009f\u0098\u0084')).toBe('How’s it going? 😄');
    expect(fixEncoding('café')).toBe('café'); // invalid as UTF-8 bytes -> untouched
  });

  it('merges multi-file threads and infers you from the title', async () => {
    const chats = await parseImport([
      { name: 'message_1.json', text: file(['Nick', 'Alex'], 'Alex', [
        { sender_name: 'Alex', timestamp_ms: 3, content: 'c' },
        { sender_name: 'Alex', timestamp_ms: 2, content: 'b' },
      ]) },
      { name: 'message_2.json', text: file(['Nick', 'Alex'], 'Alex', [
        { sender_name: 'Nick', timestamp_ms: 1, content: 'a' },
        { sender_name: 'Alex', timestamp_ms: 2, content: 'b' }, // duplicate
      ]) },
    ]);
    expect(chats).toHaveLength(1);
    expect(chats[0].messages.map((m) => m.content)).toEqual(['a', 'b', 'c']);
    // Alex sends most, but the title says Alex is the other person
    expect(chats[0].you).toBe('Nick');
    expect(chats[0].youConfident).toBe(true);
  });

  it('removes only the overlap between files, keeping real repeats', async () => {
    const long = 'x'.repeat(40);
    const chats = await parseImport([
      { name: 'message_1.json', text: file(['Nick', 'Alex'], 'Alex', [
        { sender_name: 'Alex', timestamp_ms: 5, content: 'ok' },
        { sender_name: 'Alex', timestamp_ms: 5, content: 'ok' },
        { sender_name: 'Alex', timestamp_ms: 6, content: `${long} first` },
      ]) },
      { name: 'message_2.json', text: file(['Nick', 'Alex'], 'Alex', [
        { sender_name: 'Alex', timestamp_ms: 5, content: 'ok' }, // overlaps file 1
        { sender_name: 'Alex', timestamp_ms: 6, content: `${long} second` }, // same 40-char prefix, different text
      ]) },
    ]);
    expect(chats[0].messages.map((m) => m.content)).toEqual(['ok', 'ok', `${long} first`, `${long} second`]);
    expect(chats[0].messages.every((m) => !('source' in m))).toBe(true);
  });

  it('turns reaction notifications into reaction events', async () => {
    // Real exports encode these with the Latin-1 mojibake too
    const mojibakeLaugh = '\u00f0\u009f\u0098\u0082';
    const [chat] = await parseImport([{ name: 'message_1.json', text: file(['Nick', 'Alex'], 'Alex', [
      { sender_name: 'Alex', timestamp_ms: 1, content: 'joke' },
      { sender_name: 'Nick', timestamp_ms: 2, content: `Reacted ${mojibakeLaugh} to your message ` },
      { sender_name: 'Alex', timestamp_ms: 3, content: 'Liked a message' },
      { sender_name: 'Alex', timestamp_ms: 4, content: 'second' },
    ]) }]);

    const [, laugh, like] = chat.messages;
    expect(laugh).toMatchObject({ type: 'Reaction', reaction: '😂', content: '' });
    expect(like).toMatchObject({ type: 'Reaction', reaction: '❤️', content: '' });

    // Reaction events neither count as messages nor join bubble groups
    const withSent = chat.messages.map((m) => ({ ...m, isSent: m.sender === 'Nick' }));
    expect(computeStats(withSent).totalMessages).toBe(2);
    expect(getBubblePosition(chat.messages, 3)).toBe('solo');
  });

  it('drops the redundant "sent an attachment" text on shares only', () => {
    expect(classifyInstagramContent('Alex sent an attachment.', 'Alex', true)).toEqual({ type: 'Share', content: '' });
    expect(classifyInstagramContent('Alex sent an attachment.', 'Alex', false).content).toBe('Alex sent an attachment.');
    expect(classifyInstagramContent('Reacted to your message lol', 'Alex', false).type).toBeNull();
  });

  it('splits different threads and finds the common participant', async () => {
    const chats = await parseImport([
      { name: 'a.json', text: file(['Me', 'Ann', 'Bo'], 'Group', [{ sender_name: 'Ann', timestamp_ms: 1, content: 'x' }]) },
      { name: 'b.json', text: file(['Me', 'Cy'], 'Something', [{ sender_name: 'Cy', timestamp_ms: 1, content: 'y' }]) },
    ]);
    expect(chats).toHaveLength(2);
    expect(chats.every((c) => c.you === 'Me' && c.youConfident)).toBe(true);
    expect(chats[0].id).not.toBe(chats[1].id);
  });
});

// ---------------------------------------------------------------------------
// Snapchat
// ---------------------------------------------------------------------------

describe('Snapchat parser', () => {
  const msg = (From, IsSender, ms, Content) => ({
    From, IsSender, Content, 'Media Type': 'TEXT',
    Created: new Date(ms).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC'),
    'Created(microseconds)': ms,
  });

  it('keeps every conversation', async () => {
    const data = {
      alex: [msg('alex', false, 1790936162000, 'hi'), msg('me', true, 1790936163000, 'yo')],
      sam: [msg('sam', false, 1790936164000, 'hey')],
    };
    const chats = await parseImport([{ name: 'chat_history.json', text: JSON.stringify(data) }]);
    expect(chats.map((c) => c.title)).toEqual(['alex', 'sam']);
    expect(chats[0].you).toBe('me');
  });

  it('handles millisecond and microsecond timestamps', () => {
    expect(getSnapTimestamp({ 'Created(microseconds)': 1790936162000 })).toBe(1790936162000);
    expect(getSnapTimestamp({ 'Created(microseconds)': 1790936162000123 })).toBe(1790936162000);
    expect(getSnapTimestamp({ Created: '2026-10-02 10:16:02 UTC' })).toBe(1790936162000);
  });
});

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

describe('layout helpers', () => {
  it('labels yesterday across a month boundary', () => {
    const now = new Date(2024, 2, 1, 10, 0); // Mar 1
    expect(formatDateHeader(new Date(2024, 1, 29, 23, 0), now)).toBe('Yesterday');
    expect(formatDateHeader(new Date(2024, 2, 1, 0, 1), now)).toBe('Today');
    expect(formatDateHeader(new Date(2024, 1, 27), now)).toBe('Tuesday');
    expect(formatDateHeader(new Date(2024, 2, 5), now)).toBe('March 5');
  });

  it('finds first message at or after a time', () => {
    const msgs = [10, 20, 20, 30].map((timestamp) => ({ timestamp }));
    expect(findIndexAtOrAfter(msgs, 5)).toBe(0);
    expect(findIndexAtOrAfter(msgs, 20)).toBe(1);
    expect(findIndexAtOrAfter(msgs, 25)).toBe(3);
    expect(findIndexAtOrAfter(msgs, 99)).toBe(3);
  });
});
