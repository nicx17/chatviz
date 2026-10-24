import { useState, useCallback, useRef } from 'react';
import { Upload, FileJson, AlertCircle, Loader2 } from 'lucide-react';

function DropLabel({ busy, dragOver }) {
  if (busy) return busy;
  if (dragOver) return 'Drop them here!';
  return (
    <>
      <span className="pointer-coarse:hidden">Drop your chat export files</span>
      <span className="hidden pointer-coarse:inline">Tap to choose your chat export files</span>
    </>
  );
}

const ACCEPTED = /\.(json|txt|zip)$/i;

/**
 * Landing screen: branding, file drop/picker, messages and (as children)
 * the vault, re-import and library panels. Input is ignored while `busy`.
 */
export default function DropZone({ onFiles, error, busy, notice, children }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (busy) return;

      const files = Array.from(e.dataTransfer.files || []).filter((f) =>
        ACCEPTED.test(f.name),
      );
      if (files.length > 0) {
        onFiles(files);
      }
    },
    [onFiles, busy],
  );

  const handleClick = useCallback(() => {
    if (!busy) inputRef.current?.click();
  }, [busy]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!busy) inputRef.current?.click();
    }
  }, [busy]);

  const handleInputChange = useCallback(
    (e) => {
      const files = Array.from(e.target.files || []).filter((f) =>
        ACCEPTED.test(f.name),
      );
      if (files.length > 0) {
        onFiles(files);
      }
      // Allow re-selecting the same file later
      e.target.value = '';
    },
    [onFiles],
  );

  return (
    <div className="flex w-full flex-col items-center gap-6 px-4 animate-slide-up sm:gap-8 sm:px-6">
      {/* Logo / branding */}
      <div className="flex flex-col items-center gap-3">
        <div className="ig-gradient flex h-16 w-16 items-center justify-center rounded-2xl shadow-lg shadow-purple-500/20 animate-float">
          <FileJson size={32} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold text-ig-text-primary">ChatViz</h1>
        <p className="max-w-sm text-center text-sm leading-relaxed text-ig-text-secondary">
          View your Instagram, Snapchat or WhatsApp chat history with a premium interface.
          100% private -- files are processed and saved only in this browser, never uploaded.
        </p>
      </div>

      {/* Drop zone */}
      <div
        className={`drop-zone ${dragOver ? 'drag-over' : ''} flex w-full max-w-md flex-col items-center gap-4 rounded-2xl px-6 py-8 transition-all sm:p-10 ${busy ? 'cursor-progress' : 'cursor-pointer'}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        id="dropzone"
        role="button"
        tabIndex={0}
        aria-label="Upload your chat export files"
        aria-busy={!!busy}
        aria-disabled={!!busy}
      >
        {busy ? (
          <Loader2
            size={40}
            className="animate-spin text-accent"
          />
        ) : (
          <Upload
            size={40}
            className={`transition-colors ${dragOver ? 'text-accent' : 'text-ig-text-tertiary'}`}
          />
        )}

        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-base font-medium text-ig-text-primary" aria-live="polite">
            <DropLabel busy={busy} dragOver={dragOver} />
          </p>
          {!busy && (
            <p className="text-xs leading-relaxed text-ig-text-tertiary">
              Instagram message_*.json · Snapchat chat_history.json · WhatsApp .txt or .zip
            </p>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".json,.txt,.zip,application/json,text/plain,application/zip"
          multiple
          className="hidden"
          onChange={handleInputChange}
          id="file-input"
          aria-label="File input"
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="flex w-full max-w-md items-center gap-2 rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger animate-fade-in" role="alert">
          <AlertCircle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="flex w-full max-w-md items-center gap-2 rounded-xl border border-warn-border bg-warn-bg px-4 py-3 text-sm text-warn animate-fade-in" role="status">
          <AlertCircle size={18} className="shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {children}

      {/* Instructions */}
      <div className="flex flex-col gap-4 text-xs text-ig-text-tertiary max-w-md w-full">
        <div>
          <p className="font-medium text-ig-text-secondary">Instagram export:</p>
          <ol className="list-decimal list-inside space-y-1 leading-relaxed mt-1">
            <li>Settings &rarr; Your Activity &rarr; Download Your Information</li>
            <li>Select &quot;Messages&quot; and choose JSON format</li>
            <li>Upload the <code className="rounded bg-ig-surface-elevated px-1.5 py-0.5 text-ig-text-secondary">message_*.json</code> files</li>
          </ol>
        </div>
        <div>
          <p className="font-medium text-ig-text-secondary">Snapchat export:</p>
          <ol className="list-decimal list-inside space-y-1 leading-relaxed mt-1">
            <li>Go to accounts.snapchat.com &rarr; My Data</li>
            <li>Select JSON format and include Chat History</li>
            <li>Upload the <code className="rounded bg-ig-surface-elevated px-1.5 py-0.5 text-ig-text-secondary">chat_history.json</code> file</li>
          </ol>
        </div>
        <div>
          <p className="font-medium text-ig-text-secondary">WhatsApp export:</p>
          <ol className="list-decimal list-inside space-y-1 leading-relaxed mt-1">
            <li>Open the chat &rarr; &#8942; / contact name &rarr; Export chat</li>
            <li>Choose &quot;Include media&quot; to see photos &amp; voice notes</li>
            <li>Upload the <code className="rounded bg-ig-surface-elevated px-1.5 py-0.5 text-ig-text-secondary">.zip</code> (or the <code className="rounded bg-ig-surface-elevated px-1.5 py-0.5 text-ig-text-secondary">.txt</code> inside it)</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
