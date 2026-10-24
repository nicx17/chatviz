import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { formatShortDate } from '../utils/layout.js';

const PLATFORM = { instagram: 'Instagram', snapchat: 'Snapchat', whatsapp: 'WhatsApp' };

function Summary({ label, count, firstTs, lastTs }) {
  return (
    <p className="text-[11px] text-ig-text-tertiary">
      <span className="font-medium text-ig-text-secondary">{label}:</span>{' '}
      {count.toLocaleString()} messages · {formatShortDate(firstTs)} – {formatShortDate(lastTs)}
    </p>
  );
}

/**
 * Shown when imported chats look like newer exports of saved ones.
 *
 * `items`: [{ chat, match }] where `match` is the saved chat's metadata (or
 * null for chats with no match, which are saved as they are).
 * `onResolve(choices)` gets 'replace' | 'new' per item; `onCancel` drops
 * the import.
 */
export default function ReimportPanel({ items, onResolve, onCancel }) {
  const [choices, setChoices] = useState(() => items.map(() => 'replace'));
  const conflicts = items.map((item, i) => ({ ...item, i })).filter((item) => item.match);

  const choose = (i, value) => setChoices((prev) => prev.map((c, j) => (j === i ? value : c)));

  return (
    <section className="glass-card flex w-full max-w-md flex-col gap-4 rounded-2xl p-4 animate-fade-in sm:p-5" aria-labelledby="reimport-heading" id="reimport-panel">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10">
          <RefreshCw size={16} className="text-accent" />
        </div>
        <h2 id="reimport-heading" className="text-sm font-semibold text-ig-text-primary">
          {conflicts.length === 1 ? 'This chat is already saved' : `${conflicts.length} chats are already saved`}
        </h2>
      </div>

      <ul className="flex flex-col gap-3">
        {conflicts.map(({ chat, match, i }) => {
          const { messages } = chat;
          return (
            <li key={chat.id} className="flex flex-col gap-2 rounded-xl border border-ig-border bg-ig-surface/60 p-3">
              <p className="truncate text-sm font-medium text-ig-text-primary">
                {match.title} <span className="font-normal text-ig-text-tertiary">· {PLATFORM[match.platform] || match.platform}</span>
              </p>
              <div className="flex flex-col gap-0.5">
                <Summary label="Saved" count={match.messageCount} firstTs={match.firstTs} lastTs={match.lastTs} />
                <Summary label="New" count={messages.length} firstTs={messages[0]?.timestamp} lastTs={messages.at(-1)?.timestamp} />
              </div>
              <div role="radiogroup" aria-label={`What to do with ${match.title}`} className="grid grid-cols-2 gap-1 rounded-xl bg-ig-surface-elevated p-1">
                {[
                  ['replace', 'Replace saved'],
                  ['new', 'Save as new'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    role="radio"
                    aria-checked={choices[i] === value}
                    onClick={() => choose(i, value)}
                    className={`min-h-10 rounded-lg px-2 text-xs font-medium transition-colors sm:min-h-8 ${
                      choices[i] === value
                        ? 'bg-accent-solid text-white shadow-sm'
                        : 'text-ig-text-secondary hover:text-ig-text-primary'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-[11px] leading-relaxed text-ig-text-tertiary">
        Replacing keeps your &quot;which one is you&quot; choice. Saving as new keeps both versions side by side.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onResolve(choices)}
          className="min-h-10 flex-1 rounded-xl bg-accent-solid px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-solid-end"
          id="reimport-continue"
        >
          Continue
        </button>
        <button
          onClick={onCancel}
          className="min-h-10 rounded-xl px-3 py-2 text-sm text-ig-text-secondary hover:bg-ig-surface-hover"
          id="reimport-cancel"
        >
          Cancel import
        </button>
      </div>
    </section>
  );
}
