import { useEffect, useRef, useState } from 'react';
import { Palette, Check } from 'lucide-react';
import { THEMES, ACCENTS, setAppearance, useAppearance } from '../theme.js';

/**
 * Palette button with a popover for the background theme and accent colour.
 * Each tile renders inside its own data-theme, so it previews that theme.
 */
export default function ThemePicker() {
  const [open, setOpen] = useState(false);
  const { theme, accent } = useAppearance();
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors sm:h-8 sm:w-8 ${
          open ? 'bg-accent/15 text-accent' : 'text-ig-text-secondary hover:bg-ig-surface-hover hover:text-ig-text-primary'
        }`}
        aria-label="Theme"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Theme"
        id="btn-theme"
      >
        <Palette size={17} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Theme"
          className="absolute right-0 top-full z-30 mt-2 flex w-[min(20rem,calc(100vw-1rem))] flex-col gap-4 rounded-2xl border border-ig-border-light bg-ig-surface-elevated p-4 shadow-2xl shadow-black/40 animate-fade-in"
        >
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-ig-text-secondary" id="theme-bg-label">Background</p>
            <div role="radiogroup" aria-labelledby="theme-bg-label" className="grid grid-cols-5 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  role="radio"
                  aria-checked={theme === t.id}
                  onClick={() => setAppearance({ theme: t.id })}
                  className="theme-option flex min-w-0 flex-col items-center gap-1.5 rounded-xl"
                >
                  <span className="theme-preview" data-theme={t.id}>
                    <span className="preview-in" />
                    <span className="preview-out" />
                    <span className="preview-in" />
                  </span>
                  <span className={`text-center text-[11px] leading-tight ${theme === t.id ? 'font-medium text-ig-text-primary' : 'text-ig-text-tertiary'}`}>
                    {t.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-ig-text-secondary" id="theme-accent-label">Accent colour</p>
            <div role="radiogroup" aria-labelledby="theme-accent-label" className="flex flex-wrap gap-2.5">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  role="radio"
                  aria-checked={accent === a.id}
                  aria-label={a.label}
                  title={a.label}
                  data-accent={a.id}
                  onClick={() => setAppearance({ accent: a.id })}
                  className="accent-swatch flex h-8 w-8 items-center justify-center rounded-full text-white"
                >
                  {accent === a.id && <Check size={15} strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
