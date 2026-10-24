import {
  Image,
  Play,
  Mic,
  ExternalLink,
  Phone,
  PhoneMissed,
  Ban,
  Reply,
  Info,
  Sticker,
} from 'lucide-react';
import { formatTimestamp } from '../utils/layout.js';
import { useMediaUrl } from '../hooks/useMediaUrl.js';

/**
 * Wraps case-insensitive occurrences of `query` in <mark>.
 */
function Highlighted({ text, query }) {
  if (!query) return text;
  const lower = text.toLowerCase();
  const parts = [];
  let from = 0;
  let at = lower.indexOf(query);
  while (at !== -1) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(<mark key={at} className="search-mark">{text.slice(at, at + query.length)}</mark>);
    from = at + query.length;
    at = lower.indexOf(query, from);
  }
  parts.push(text.slice(from));
  return parts;
}

/**
 * Only http(s) links are clickable -- export files are untrusted input and
 * could contain javascript: or data: URLs.
 */
function safeHref(link) {
  try {
    const url = new URL(link);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function confirmOpen(e, href) {
  e.stopPropagation();
  // Opening a link contacts a third-party server -- make that explicit
  if (!window.confirm(`Open this link in a new tab?\n\n${href}\n\nThis leaves ChatViz and contacts an external site.`)) {
    e.preventDefault();
  }
}

function PhotoItem({ uri }) {
  const url = useMediaUrl(uri);
  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <img src={url} alt="" loading="lazy" className="block max-h-80 w-full object-cover" />
      </a>
    );
  }
  return (
    // Fixed width: the bubble has no other content to size it
    <div className="relative w-60 max-w-full">
      <div className="flex aspect-[4/3] items-center justify-center bg-ig-surface-elevated">
        <Image size={28} className="text-ig-text-tertiary" />
      </div>
      <div className="absolute bottom-2 left-2 glass-card rounded-lg px-2 py-1 text-[10px] text-ig-text-secondary">
        Photo
      </div>
    </div>
  );
}

function VideoItem({ uri }) {
  const url = useMediaUrl(uri);
  if (url) {
    return <video src={url} controls preload="metadata" className="block max-h-80 w-full bg-black" />;
  }
  return (
    <div className="relative w-64 max-w-full">
      <div className="flex aspect-video items-center justify-center bg-ig-surface-elevated">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm">
          <Play size={20} className="ml-0.5 text-white" />
        </div>
      </div>
      <div className="absolute bottom-2 left-2 glass-card rounded-lg px-2 py-1 text-[10px] text-ig-text-secondary">
        Video
      </div>
    </div>
  );
}

function AudioItem({ uri, isSent }) {
  const url = useMediaUrl(uri);
  if (url) {
    return (
      <div className="px-2 py-2">
        <audio src={url} controls preload="metadata" className="h-10 w-64 max-w-full" />
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${isSent ? 'text-white' : 'text-ig-text-primary'}`}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-current/15">
        <Mic size={16} />
      </div>
      <div className="flex h-6 items-end gap-[3px] opacity-70">
        {Array.from({ length: 24 }, (_, i) => (
          <div
            key={i}
            className="audio-bar"
            style={{
              height: `${Math.max(4, Math.sin(i * 0.6) * 18 + Math.sin(i * 1.3 + 2) * 8)}px`,
              animationDelay: `${i * 50}ms`,
            }}
          />
        ))}
      </div>
      <span className={`ml-auto shrink-0 text-[11px] ${isSent ? 'text-white/75' : 'text-ig-text-tertiary'}`}>
        0:00
      </span>
    </div>
  );
}

function StickerItem({ uri }) {
  const url = useMediaUrl(uri);
  return (
    <div className="flex items-center justify-center p-2">
      {url ? (
        <img src={url} alt="Sticker" className="h-32 w-32 object-contain" />
      ) : (
        <div className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-xl bg-ig-surface-elevated text-ig-text-tertiary">
          <Sticker size={28} />
          <span className="text-[10px]">Sticker</span>
        </div>
      )}
    </div>
  );
}

/**
 * Single message bubble with premium styling.
 *
 * Memoized at the ChatView level (MemoizedBubble) to prevent scroll-triggered
 * re-renders. This component only re-renders if its props actually change.
 */
export default function MessageBubble({
  msg,
  bubblePosition,
  showTimestamps,
  invertedView,
  isGroup,
  highlight,
  isActiveMatch,
}) {
  const { isSent } = msg;

  // invertedView flips which side messages appear on, but keeps colors the same.
  // XOR: if invertedView is true, sent messages go left and received go right.
  const isRight = invertedView ? !isSent : isSent;

  // Determine CSS class for bubble radius based on grouping position
  const side = isRight ? 'sent' : 'received';
  const radiusClass = `bubble-${side}-${bubblePosition}`;
  const bgClass = isSent ? 'bubble-sent' : 'bubble-received';
  const matchClass = isActiveMatch ? 'search-active' : '';

  // System messages (WhatsApp group events, encryption notice, ...)
  if (msg.type === 'System') {
    return (
      <div className="flex justify-center px-4 py-1.5">
        <div className={`system-pill ${matchClass}`}>
          <Info size={13} className="shrink-0" />
          <span><Highlighted text={msg.content} query={highlight} /></span>
        </div>
      </div>
    );
  }

  // Reaction notifications ("Reacted 😂 to your message")
  if (msg.type === 'Reaction') {
    return (
      <div className={`flex px-3 py-0.5 sm:px-4 ${isRight ? 'justify-end' : 'justify-start'}`}>
        <div className="flex items-center gap-1.5 text-xs text-ig-text-tertiary">
          <span className="reaction-pill">{msg.reaction}</span>
          <span>{isSent ? 'You' : msg.sender} reacted to a message</span>
        </div>
      </div>
    );
  }

  // Unsent messages
  if (msg.isUnsent) {
    return (
      <div className={`flex px-3 py-0.5 sm:px-4 ${isRight ? 'justify-end' : 'justify-start'}`}>
        <div className="unsent-message flex items-center gap-1.5 text-xs text-ig-text-tertiary">
          <Ban size={12} />
          <span>Message unsent</span>
        </div>
      </div>
    );
  }

  // Call messages
  if (msg.isCall) {
    const duration = msg.callDuration || 0;
    const missed = duration === 0;
    const formatted = duration > 0
      ? `${Math.floor(duration / 60)}m ${duration % 60}s`
      : '';

    return (
      <div className="flex justify-center px-4 py-1.5">
        <div className="call-indicator">
          {missed ? <PhoneMissed size={15} /> : <Phone size={15} />}
          <span>
            {missed
              ? 'Missed call'
              : `Call ended - ${formatted}`}
          </span>
        </div>
      </div>
    );
  }

  const shareHref = msg.share?.link ? safeHref(msg.share.link) : null;
  const shareBody = msg.share && (
    <>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10">
        <ExternalLink size={16} className="text-accent" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ig-text-primary">
          {msg.share.text || msg.share.link || 'Shared a link'}
        </p>
        {msg.share.link && (
          <p className="truncate text-[11px] text-ig-text-tertiary">
            {msg.share.link}
          </p>
        )}
      </div>
    </>
  );

  return (
    <div
      className={`flex px-3 sm:px-4 ${bubblePosition === 'first' || bubblePosition === 'solo' ? 'pt-2' : 'pt-0.5'} ${isRight ? 'justify-end' : 'justify-start'}`}
    >
      <div className="flex min-w-0 max-w-[85%] flex-col gap-0.5 sm:max-w-[75%]">
        {/* Sender name for group chats on received-first/solo */}
        {isGroup && !isSent && (bubblePosition === 'first' || bubblePosition === 'solo') && (
          <span className={`mb-0.5 text-[11px] font-medium text-ig-text-tertiary ${isRight ? 'mr-1 text-right' : 'ml-1'}`}>
            {msg.sender}
          </span>
        )}

        <div
          className={`${bgClass} ${radiusClass} ${matchClass} relative overflow-hidden transition-shadow duration-200 hover:shadow-lg`}
        >
          {/* Reply quote */}
          {msg.repliedTo && (
            <div className={`mx-1.5 mt-1.5 flex items-start gap-1.5 rounded-lg border-l-2 px-2.5 py-1.5 ${
              isSent
                ? 'border-white/30 bg-white/10'
                : 'border-ig-text-tertiary/40 bg-ig-surface/60'
            }`}>
              <Reply size={12} className={`mt-0.5 shrink-0 ${isSent ? 'text-white/50' : 'text-ig-text-tertiary'}`} />
              <div className="min-w-0 flex-1">
                <p className={`text-[11px] font-medium leading-none ${isSent ? 'text-white/70' : 'text-ig-text-secondary'}`}>
                  {msg.repliedTo.sender}
                </p>
                <p className={`mt-0.5 truncate text-[12px] leading-snug ${isSent ? 'text-white/50' : 'text-ig-text-tertiary'}`}>
                  {msg.repliedTo.content || 'Attachment'}
                </p>
              </div>
            </div>
          )}

          {/* Photos */}
          {msg.photos?.length > 0 && (
            <div className="media-container m-0.5">
              {msg.photos.map((photo, i) => (
                <PhotoItem key={i} uri={photo.uri} />
              ))}
            </div>
          )}

          {/* Videos */}
          {msg.videos?.length > 0 && (
            <div className="media-container m-0.5">
              {msg.videos.map((video, i) => (
                <VideoItem key={i} uri={video.uri} />
              ))}
            </div>
          )}

          {/* Audio / Voice notes */}
          {msg.audioFiles?.map((audio, i) => (
            <AudioItem key={i} uri={audio.uri} isSent={isSent} />
          ))}

          {/* Shared link / post */}
          {msg.share && (shareHref ? (
            <a
              href={shareHref}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              className="share-card mx-1 mt-1 mb-0.5 flex items-center gap-2.5 p-3 no-underline"
              onClick={(e) => confirmOpen(e, shareHref)}
            >
              {shareBody}
            </a>
          ) : (
            <div className="share-card mx-1 mt-1 mb-0.5 flex items-center gap-2.5 p-3">
              {shareBody}
            </div>
          ))}

          {/* Sticker */}
          {msg.sticker && <StickerItem uri={msg.sticker.uri} />}

          {/* Text content */}
          {msg.content && (
            <p
              className={`whitespace-pre-wrap break-words px-3.5 py-2 text-[15px] leading-snug ${
                isSent ? 'text-white' : 'text-ig-text-primary'
              }`}
            >
              <Highlighted text={msg.content} query={highlight} />
            </p>
          )}
        </div>

        {/* Reactions */}
        {msg.reactions?.length > 0 && (
          <div
            className={`flex flex-wrap gap-1 ${isRight ? 'justify-end' : 'justify-start'} -mt-2 ${isRight ? 'mr-1' : 'ml-1'} relative z-[1]`}
          >
            {msg.reactions.map((r, i) => (
              <span key={i} className="reaction-pill" title={r.actor}>
                {r.emoji}
              </span>
            ))}
          </div>
        )}

        {/* Always-visible timestamp (controlled by toggle) */}
        {showTimestamps && (
          <span
            className={`text-[10px] text-ig-text-tertiary ${isRight ? 'text-right mr-1' : 'ml-1'}`}
          >
            {formatTimestamp(msg.timestamp)}
          </span>
        )}
      </div>
    </div>
  );
}
