import { useState } from 'react';
import { Lock, KeyRound, Loader2, AlertCircle } from 'lucide-react';

const MIN_LENGTH = 8;

/**
 * Passphrase form for the encrypted chat store.
 *
 * mode="create": first-time setup (passphrase + confirm)
 * mode="unlock": enter the existing passphrase
 *
 * `onSubmit(passphrase)` resolves to an error message, or null on success.
 * `onSkip` (optional) offers viewing the imported chat without saving it.
 */
export default function VaultPanel({ mode, legacyChats = 0, pendingCount = 0, onSubmit, onSkip, onReset }) {
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const isCreate = mode === 'create';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isCreate && passphrase.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (isCreate && passphrase !== confirm) {
      setError("Passphrases don't match.");
      return;
    }

    setBusy(true);
    setError(null);
    const message = await onSubmit(passphrase);
    setBusy(false);
    setPassphrase('');
    setConfirm('');
    if (message) setError(message);
  };

  let heading = isCreate ? 'Protect your saved chats' : 'Unlock your saved chats';
  if (pendingCount > 0) {
    heading = isCreate ? 'Set a passphrase to save' : 'Unlock to save';
  }

  return (
    <section className="glass-card flex w-full max-w-md flex-col gap-3 rounded-2xl p-4 animate-fade-in sm:p-5" aria-labelledby="vault-heading" id="vault-panel">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10">
          {isCreate ? <KeyRound size={16} className="text-accent" /> : <Lock size={16} className="text-accent" />}
        </div>
        <h2 id="vault-heading" className="text-sm font-semibold text-ig-text-primary">{heading}</h2>
      </div>

      <p className="text-xs leading-relaxed text-ig-text-secondary">
        {isCreate
          ? "Saved chats are encrypted on this device with your passphrase. It can't be recovered -- if you forget it, saved chats are lost."
          : 'Your saved chats are encrypted. Enter your passphrase to open them.'}
        {pendingCount > 0 && ` ${pendingCount === 1 ? 'The imported chat' : `${pendingCount} imported chats`} will be saved after this.`}
      </p>
      {isCreate && legacyChats > 0 && (
        <p className="text-xs text-warn">
          {legacyChats} {legacyChats === 1 ? 'chat' : 'chats'} saved by an earlier version without encryption will be encrypted now.
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder="Passphrase"
          autoComplete={isCreate ? 'new-password' : 'current-password'}
          className="vault-input"
          aria-label="Passphrase"
          id="vault-passphrase"
          disabled={busy}
          autoFocus
        />
        {isCreate && (
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm passphrase"
            autoComplete="new-password"
            className="vault-input"
            aria-label="Confirm passphrase"
            id="vault-confirm"
            disabled={busy}
          />
        )}

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-danger" role="alert">
            <AlertCircle size={14} /> {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={busy || !passphrase}
            className="flex min-h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-accent-solid px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-solid-end disabled:opacity-50"
            id="vault-submit"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {isCreate ? 'Encrypt & save' : 'Unlock'}
          </button>
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              disabled={busy}
              className="min-h-10 rounded-xl px-3 py-2 text-sm text-ig-text-secondary hover:bg-ig-surface-hover"
              id="vault-skip"
            >
              View without saving
            </button>
          )}
        </div>
      </form>

      {!isCreate && onReset && (
        confirmReset ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-ig-text-secondary">Erase all saved chats and the passphrase?</span>
            <button
              onClick={() => { setConfirmReset(false); onReset(); }}
              className="rounded-full bg-red-600 px-3 py-2 font-medium text-white hover:bg-red-700 sm:py-1"
              id="vault-reset-confirm"
            >
              Erase
            </button>
            <button
              onClick={() => setConfirmReset(false)}
              className="rounded-full px-3 py-2 text-ig-text-secondary hover:bg-ig-surface-hover sm:py-1"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            className="self-start py-1.5 text-xs text-ig-text-tertiary hover:text-danger"
            id="vault-forgot"
          >
            Forgot passphrase? Erase saved chats
          </button>
        )
      )}
    </section>
  );
}
