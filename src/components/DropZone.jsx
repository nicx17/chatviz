import { useState, useCallback, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { Scribble, BubbleTail, TypingDots, LockDoodle, DoodleField } from './Doodles.jsx';

const ACCEPTED = /\.(json|txt|zip)$/i;

const HOW_TO = [
  {
    id: 'instagram',
    label: 'Instagram',
    dot: 'ig-gradient',
    steps: [
      'Settings → Your activity → Download your information',
      'Choose Messages, in JSON format',
      <>Add the <code>message_*.json</code> files</>,
    ],
  },
  {
    id: 'snapchat',
    label: 'Snapchat',
    dot: 'bg-yellow-400',
    steps: [
      'accounts.snapchat.com → My Data',
      'Choose JSON and include Chat History',
      <>Add <code>chat_history.json</code></>,
    ],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    dot: 'bg-green-600',
    steps: [
      'Open the chat → ⋮ → Export chat',
      'Include media to see photos and voice notes',
      <>Add the <code>.zip</code> (or the <code>.txt</code> inside it)</>,
    ],
  },
];

function HowToExport() {
  const [open, setOpen] = useState(null);
  const platform = HOW_TO.find((p) => p.id === open);

  return (
    <section className="home-howto" aria-labelledby="howto-heading">
      <h2 id="howto-heading" className="text-sm font-medium text-ig-text-secondary">How to export</h2>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {HOW_TO.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpen(open === p.id ? null : p.id)}
            aria-expanded={open === p.id}
            aria-controls="howto-steps"
            className="howto-chip"
          >
            <span className={`h-2.5 w-2.5 rounded-full ${p.dot}`} aria-hidden="true" />
            {p.label}
          </button>
        ))}
      </div>
      <div id="howto-steps">
        {platform && (
          <ol key={platform.id} className="howto-steps animate-fade-in" aria-label={`${platform.label} export steps`}>
            {platform.steps.map((step, i) => (
              <li key={i}>
                <span className="howto-num" aria-hidden="true">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function PromptText({ busy, dragOver }) {
  if (busy) {
    return (
      <span className="flex items-center gap-3">
        <TypingDots />
        <span className="text-sm text-ig-text-secondary">{busy}</span>
      </span>
    );
  }
  if (dragOver) return 'Let go to open it';
  return (
    <>
      <span className="pointer-coarse:hidden">Drop your chat export here</span>
      <span className="hidden pointer-coarse:inline">Pick the chat you exported</span>
    </>
  );
}

/**
 * Landing screen: header, headline, a doodled chat that doubles as the file
 * drop target, export help, messages and (as children) the vault, re-import
 * and library panels. `compact` drops the illustration so returning users
 * see their panels sooner. Input is ignored while `busy`.
 */
export default function DropZone({ onFiles, error, busy, notice, compact, headerActions, children }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const openPicker = useCallback(() => {
    if (!busy) inputRef.current?.click();
  }, [busy]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // Moving onto one of the bubbles inside isn't leaving
    if (e.currentTarget.contains(e.relatedTarget)) return;
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
    <div className="home relative flex min-h-full flex-col">
      <DoodleField />

      {/* Above <main>: the theme picker's popover opens down over it */}
      <header className="relative z-20 mx-auto flex w-full max-w-md items-center justify-between px-4 pt-3 sm:px-6 sm:pt-5 lg:max-w-5xl">
        <div className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" width="36" height="36" className="h-9 w-9 rounded-[10px]" />
          <span className="font-display text-xl font-bold tracking-tight text-ig-text-primary">ChatViz</span>
        </div>
        {headerActions}
      </header>

      {/* Centred vertically when there's room (large screens) */}
      <main className="relative z-10 flex flex-1 items-center">
        <div className="home-grid mx-auto w-full max-w-md px-4 pb-14 pt-8 sm:px-6 lg:max-w-5xl lg:py-12">
          <div className="home-head">
            <h1 className="home-title font-display">Your chats,<br /> back in<br /> bubbles.</h1>
            <p className="mt-4 text-ig-text-secondary">For Instagram, Snapchat and WhatsApp exports.</p>
          </div>

          <div className="home-drop flex flex-col gap-4">
            {/* Clicking anywhere opens the picker; keyboard users get the button */}
            <div
              className={`chat-drop ${dragOver ? 'is-dragging' : ''} ${busy ? 'cursor-progress' : 'cursor-pointer'}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={openPicker}
              id="dropzone"
            >
              {!compact && (
                <>
                  <div className="doodle-bubble doodle-in w-[74%]" style={{ '--i': 0 }}>
                    <BubbleTail />
                    <Scribble lines={[0.94, 0.58]} />
                  </div>
                  <div className="doodle-bubble doodle-out w-[60%]" style={{ '--i': 1 }}>
                    <BubbleTail />
                    <Scribble lines={[0.9, 0.66]} seed={2} />
                  </div>
                  <div className="doodle-bubble doodle-in w-[46%]" style={{ '--i': 2 }}>
                    <BubbleTail />
                    <Scribble lines={[0.82]} seed={1} />
                  </div>
                </>
              )}

              <div className="doodle-bubble doodle-in doodle-prompt" style={{ '--i': compact ? 0 : 3 }}>
                <BubbleTail />
                <p aria-live="polite">
                  <PromptText busy={busy} dragOver={dragOver} />
                </p>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openPicker();
                }}
                disabled={!!busy}
                className="doodle-bubble doodle-out doodle-send"
                style={{ '--i': compact ? 1 : 4 }}
                id="btn-choose-files"
              >
                <BubbleTail />
                Choose files
              </button>
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

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger animate-fade-in" role="alert">
                <AlertCircle size={18} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {notice && (
              <div className="flex items-center gap-2 rounded-xl border border-warn-border bg-warn-bg px-4 py-3 text-sm text-warn animate-fade-in" role="status">
                <AlertCircle size={18} className="shrink-0" />
                <span>{notice}</span>
              </div>
            )}

            {children}
          </div>

          <p className="home-privacy flex items-center gap-2.5 text-sm text-ig-text-secondary">
            <LockDoodle className="h-6 w-6 shrink-0 text-accent" />
            Stays in this browser. Nothing is uploaded.
          </p>

          <HowToExport />
        </div>
      </main>
    </div>
  );
}
