import { useState } from 'react';
import { Trash2, HardDrive, MessageCircle, Lock, ShieldCheck } from 'lucide-react';
import { formatShortDate } from '../utils/layout.js';

const PLATFORM = {
  instagram: { label: 'Instagram', className: 'ig-gradient' },
  snapchat: { label: 'Snapchat', className: 'bg-yellow-400 text-black' },
  whatsapp: { label: 'WhatsApp', className: 'bg-green-600' },
};

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/**
 * Chats on the landing screen: encrypted ones saved in this browser, plus
 * `unsaved` ones kept in memory for this tab only.
 */
export default function Library({ chats, storage, onOpen, onDelete, onClearAll, onLock }) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // chat id

  if (chats.length === 0 && !onLock) return null;
  const anySaved = chats.some((c) => !c.unsaved);

  return (
    <section className="flex w-full max-w-md flex-col gap-3" aria-labelledby="library-heading">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id="library-heading" className="text-sm font-semibold text-ig-text-primary">
          {anySaved || onLock ? 'Saved in this browser' : 'This session'}
        </h2>
        <div className="flex items-center gap-1">
          {onLock && !confirmClear && (
            <button
              onClick={onLock}
              className="flex items-center gap-1 rounded-full px-2.5 py-2 text-xs text-ig-text-tertiary hover:bg-ig-surface-hover hover:text-ig-text-primary sm:py-1"
              id="btn-lock"
            >
              <Lock size={12} /> Lock
            </button>
          )}
          {chats.length > 0 && (confirmClear ? (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-ig-text-secondary">Delete all?</span>
              <button
                onClick={() => { onClearAll(); setConfirmClear(false); }}
                className="rounded-full bg-red-600 px-3 py-2 font-medium text-white hover:bg-red-700 sm:py-1"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="rounded-full px-3 py-2 text-ig-text-secondary hover:bg-ig-surface-hover sm:py-1"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClear(true)}
              className="rounded-full px-2.5 py-2 text-xs text-ig-text-tertiary hover:bg-ig-surface-hover hover:text-danger sm:py-1"
              id="btn-clear-all"
            >
              Clear all
            </button>
          ))}
        </div>
      </div>

      {chats.length === 0 && (
        <p className="text-xs text-ig-text-tertiary">No saved chats yet. Drop an export above.</p>
      )}

      {/* Scrolls on its own only on larger screens; on phones the page scrolls */}
      <ul className="flex flex-col gap-1.5 sm:max-h-80 sm:overflow-y-auto">
        {chats.map((chat) => {
          const platform = PLATFORM[chat.platform] || { label: chat.platform, className: 'bg-ig-surface-elevated' };
          if (confirmDelete === chat.id) {
            return (
              <li key={chat.id} className="glass-card flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5 text-xs animate-fade-in">
                <span className="min-w-0 flex-1 truncate text-ig-text-secondary">
                  Delete <span className="font-medium text-ig-text-primary">{chat.title}</span>
                  {chat.unsaved ? '?' : ' from this browser?'}
                </span>
                <button
                  onClick={() => { onDelete(chat.id); setConfirmDelete(null); }}
                  className="rounded-full bg-red-600 px-3 py-2 font-medium text-white hover:bg-red-700 sm:py-1"
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="rounded-full px-3 py-2 text-ig-text-secondary hover:bg-ig-surface-hover sm:py-1"
                >
                  Cancel
                </button>
              </li>
            );
          }
          return (
            <li key={chat.id} className="glass-card group flex items-center gap-3 rounded-xl py-1 pl-3 pr-1 sm:py-1.5">
              <button
                onClick={() => onOpen(chat.id)}
                className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left"
                aria-label={`Open chat ${chat.title}`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${platform.className}`}
                  title={platform.label}
                >
                  {chat.title.charAt(0).toUpperCase() || <MessageCircle size={16} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium text-ig-text-primary">
                    <span className="truncate">{chat.title}</span>
                    {chat.unsaved && (
                      <span className="shrink-0 rounded-full border border-warn-border bg-warn-bg px-1.5 py-px text-[10px] font-medium text-warn">
                        unsaved
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-ig-text-tertiary">
                    {platform.label} · {chat.messageCount.toLocaleString()} messages
                    {chat.mediaCount > 0 && ` · ${chat.mediaCount} files`}
                    {' · '}{formatShortDate(chat.firstTs)} – {formatShortDate(chat.lastTs)}
                  </p>
                </div>
              </button>
              <button
                onClick={() => setConfirmDelete(chat.id)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ig-text-tertiary transition hover:bg-danger-bg hover:text-danger pointer-fine:opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Delete chat ${chat.title}`}
              >
                <Trash2 size={15} />
              </button>
            </li>
          );
        })}
      </ul>

      {storage && (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-ig-text-tertiary">
          <HardDrive size={12} />
          {formatBytes(storage.usage)} used on this device
          {storage.persisted ? ' · protected from automatic cleanup' : ''}
          <span className="ml-auto flex items-center gap-1 text-success">
            <ShieldCheck size={12} /> Encrypted
          </span>
        </p>
      )}
    </section>
  );
}
