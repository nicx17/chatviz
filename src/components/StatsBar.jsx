import {
  MessageSquare,
  Send,
  Inbox,
  Image,
  Film,
  Mic,
  Calendar,
} from 'lucide-react';

/**
 * Animated statistics bar shown above the chat.
 * Glassmorphic cards with staggered entrance animations.
 */
export default function StatsBar({ stats }) {
  const firstDate = stats.firstMessage
    ? new Date(stats.firstMessage).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '--';

  const items = [
    {
      icon: MessageSquare,
      label: 'Total',
      value: stats.totalMessages.toLocaleString(),
      color: 'text-blue-400 light:text-blue-700',
      bg: 'bg-blue-500/8',
    },
    {
      icon: Send,
      label: 'Sent',
      value: stats.sentByYou.toLocaleString(),
      color: 'text-violet-400 light:text-violet-700',
      bg: 'bg-violet-500/8',
    },
    {
      icon: Inbox,
      label: 'Received',
      value: stats.sentByOther.toLocaleString(),
      color: 'text-pink-400 light:text-pink-700',
      bg: 'bg-pink-500/8',
    },
    {
      icon: Image,
      label: 'Photos',
      value: stats.photos.toLocaleString(),
      color: 'text-amber-400 light:text-amber-700',
      bg: 'bg-amber-500/8',
    },
    {
      icon: Film,
      label: 'Videos',
      value: stats.videos.toLocaleString(),
      color: 'text-emerald-400 light:text-emerald-700',
      bg: 'bg-emerald-500/8',
    },
    {
      icon: Mic,
      label: 'Audio',
      value: stats.audioFiles.toLocaleString(),
      color: 'text-cyan-400 light:text-cyan-700',
      bg: 'bg-cyan-500/8',
    },
    {
      icon: Calendar,
      label: 'Since',
      value: firstDate,
      color: 'text-rose-400 light:text-rose-700',
      bg: 'bg-rose-500/8',
    },
  ];

  return (
    <div className="stats-bar shrink-0 border-b border-ig-border/50 py-2 sm:py-3">
      {/* Scrolls sideways on phones; edge padding lives inside the scroller */}
      <div className="flex gap-2 overflow-x-auto px-3 scrollbar-none sm:px-4">
        {items.map((item, i) => (
          <div
            key={item.label}
            className="glass-card flex shrink-0 items-center gap-2 rounded-xl px-2.5 py-1.5 animate-fade-in sm:gap-2.5 sm:px-3 sm:py-2"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className={`flex h-6 w-6 items-center justify-center rounded-lg sm:h-7 sm:w-7 ${item.bg}`}>
              <item.icon size={14} className={item.color} />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] text-ig-text-tertiary leading-none">
                {item.label}
              </span>
              <span className="whitespace-nowrap text-sm font-semibold text-ig-text-primary leading-tight">
                {item.value}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
