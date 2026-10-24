/**
 * Passphrase-based encryption for everything ChatViz stores (WebCrypto).
 *
 * - PBKDF2-SHA256 (600k iterations) derives 512 bits from the passphrase:
 *     first 256 -> AES-GCM key (encrypts records)
 *     last  256 -> HMAC-SHA256 key (turns chat ids / filenames into opaque
 *                  storage keys, so key names don't leak who you talk to)
 * - Every record gets a fresh random 96-bit IV.
 * - The record's storage key is bound as AES-GCM additional data, so a
 *   ciphertext copied into another record's slot fails to decrypt.
 * - Keys are non-extractable and only ever held in memory.
 */

export const PBKDF2_ITERATIONS = 600_000;
const VERIFIER_TEXT = 'chatviz-vault-v1';

const enc = new TextEncoder();
const dec = new TextDecoder();

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}

/**
 * @returns {Promise<{ aesKey: CryptoKey, hmacKey: CryptoKey }>}
 */
export async function deriveKeys(passphrase, salt, iterations = PBKDF2_ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    512,
  ));
  const [aesKey, hmacKey] = await Promise.all([
    crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']),
    crypto.subtle.importKey('raw', bits.slice(32), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
  ]);
  bits.fill(0);
  return { aesKey, hmacKey };
}

/**
 * @param {CryptoKey} aesKey
 * @param {ArrayBuffer | Uint8Array} plaintext
 * @param {string} aad - Storage key the ciphertext belongs to
 * @returns {Promise<{ iv: Uint8Array, data: ArrayBuffer }>}
 */
export async function encryptBytes(aesKey, plaintext, aad) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(aad) },
    aesKey,
    plaintext,
  );
  return { iv, data };
}

/**
 * @throws {DOMException} OperationError if the key, AAD or data are wrong
 */
export function decryptBytes(aesKey, { iv, data }, aad) {
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(aad) },
    aesKey,
    data,
  );
}

export function encryptJSON(aesKey, value, aad) {
  return encryptBytes(aesKey, enc.encode(JSON.stringify(value)), aad);
}

export async function decryptJSON(aesKey, record, aad) {
  return JSON.parse(dec.decode(await decryptBytes(aesKey, record, aad)));
}

/**
 * Deterministic opaque id: same input + same passphrase -> same key.
 */
export async function opaqueKey(hmacKey, value) {
  return toHex(await crypto.subtle.sign('HMAC', hmacKey, enc.encode(value)));
}

/**
 * Creates the vault config stored alongside the data. Contains no secrets:
 * salt + iteration count + an encrypted known value to check passphrases.
 */
export async function createVaultConfig(passphrase) {
  const salt = randomSalt();
  const keys = await deriveKeys(passphrase, salt);
  const verifier = await encryptBytes(keys.aesKey, enc.encode(VERIFIER_TEXT), 'verifier');
  return { config: { salt, iterations: PBKDF2_ITERATIONS, verifier }, keys };
}

/**
 * @returns {Promise<{ aesKey, hmacKey } | null>} null if the passphrase is wrong
 */
export async function unlockVault(config, passphrase) {
  const keys = await deriveKeys(passphrase, config.salt, config.iterations);
  try {
    const plain = dec.decode(await decryptBytes(keys.aesKey, config.verifier, 'verifier'));
    return plain === VERIFIER_TEXT ? keys : null;
  } catch {
    return null;
  }
}
