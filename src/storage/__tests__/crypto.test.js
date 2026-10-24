import { describe, it, expect } from 'vitest';
import {
  deriveKeys,
  randomSalt,
  encryptJSON,
  decryptJSON,
  encryptBytes,
  decryptBytes,
  opaqueKey,
  createVaultConfig,
  unlockVault,
} from '../crypto.js';

// Low iteration count keeps unit tests fast; the real default is 600k
const FAST = 1000;

describe('crypto', () => {
  it('round-trips JSON and bytes', async () => {
    const { aesKey } = await deriveKeys('correct horse', randomSalt(), FAST);
    const value = { hello: 'wörld 😄', n: [1, 2, 3] };
    expect(await decryptJSON(aesKey, await encryptJSON(aesKey, value, 'k'), 'k')).toEqual(value);

    const bytes = new Uint8Array([0, 1, 2, 255]);
    const out = await decryptBytes(aesKey, await encryptBytes(aesKey, bytes, 'b'), 'b');
    expect(new Uint8Array(out)).toEqual(bytes);
  });

  it('uses a fresh IV per encryption', async () => {
    const { aesKey } = await deriveKeys('pw', randomSalt(), FAST);
    const a = await encryptJSON(aesKey, 'same', 'k');
    const b = await encryptJSON(aesKey, 'same', 'k');
    expect(a.iv).not.toEqual(b.iv);
    expect(new Uint8Array(a.data)).not.toEqual(new Uint8Array(b.data));
  });

  it('ciphertext does not contain the plaintext', async () => {
    const { aesKey } = await deriveKeys('pw', randomSalt(), FAST);
    const { data } = await encryptJSON(aesKey, 'super secret message', 'k');
    expect(new TextDecoder().decode(data)).not.toContain('secret');
  });

  it('rejects the wrong key', async () => {
    const salt = randomSalt();
    const right = await deriveKeys('right', salt, FAST);
    const wrong = await deriveKeys('wrong', salt, FAST);
    const record = await encryptJSON(right.aesKey, 'x', 'k');
    await expect(decryptJSON(wrong.aesKey, record, 'k')).rejects.toThrow();
  });

  it('rejects ciphertext moved to a different record (AAD binding)', async () => {
    const { aesKey } = await deriveKeys('pw', randomSalt(), FAST);
    const record = await encryptJSON(aesKey, 'chat A', 'messages:A');
    await expect(decryptJSON(aesKey, record, 'messages:B')).rejects.toThrow();
  });

  it('rejects tampered ciphertext', async () => {
    const { aesKey } = await deriveKeys('pw', randomSalt(), FAST);
    const record = await encryptJSON(aesKey, 'hello', 'k');
    const tampered = new Uint8Array(record.data.slice(0));
    tampered[0] ^= 1;
    await expect(decryptJSON(aesKey, { iv: record.iv, data: tampered.buffer }, 'k')).rejects.toThrow();
  });

  it('opaque keys are deterministic per passphrase and hide the input', async () => {
    const salt = randomSalt();
    const a1 = await deriveKeys('a', salt, FAST);
    const a2 = await deriveKeys('a', salt, FAST);
    const b = await deriveKeys('b', salt, FAST);
    const k1 = await opaqueKey(a1.hmacKey, 'chat:Alice');
    expect(k1).toMatch(/^[0-9a-f]{64}$/);
    expect(await opaqueKey(a2.hmacKey, 'chat:Alice')).toBe(k1);
    expect(await opaqueKey(b.hmacKey, 'chat:Alice')).not.toBe(k1);
  });

  it('vault config verifies the passphrase', async () => {
    const { config } = await createVaultConfig('my passphrase');
    expect(await unlockVault(config, 'my passphrase')).not.toBeNull();
    expect(await unlockVault(config, 'nope')).toBeNull();
  });
});
