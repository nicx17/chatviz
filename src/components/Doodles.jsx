/**
 * Hand-drawn illustrations for the landing screen, in the style of the logo:
 * chat bubbles with curved tails, scribbles standing in for message text,
 * and faint doodles scattered behind everything. All decorative.
 */

/** A wavy line from x=3 to x=3+94*length, in a 100-unit-wide box. */
function scribblePath(y, length, seed) {
  const end = 3 + 94 * length;
  const steps = 5;
  const step = (end - 3) / steps;
  let d = `M3 ${y}`;
  for (let k = 1; k <= steps; k++) {
    const lift = (((seed + k) % 3) - 1) * 1.8 + (k % 2 ? 1.1 : -1.1);
    d += ` Q${(3 + step * (k - 0.5)).toFixed(1)} ${(y + lift).toFixed(1)} ${(3 + step * k).toFixed(1)} ${y}`;
  }
  return d;
}

/**
 * Lines of scribble, one per entry in `lines` (each a 0-1 length). Stretches
 * to the bubble's width; the stroke stays the same thickness.
 */
export function Scribble({ lines, seed = 0 }) {
  const height = lines.length * 11 + 3;
  return (
    <svg
      className="scribble"
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      style={{ height }}
      aria-hidden="true"
    >
      {lines.map((length, i) => (
        <path key={i} d={scribblePath(i * 11 + 7, length, seed + i)} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

/** The logo's curved bubble tail; mirrored by CSS on sent bubbles. */
export function BubbleTail() {
  return (
    <svg className="bubble-tail" viewBox="0 0 16 18" aria-hidden="true">
      <path d="M1 18C1 10 5 3.5 14.5 0.5C9 6 8 12 11 18Z" />
    </svg>
  );
}

/** Typing indicator, shown while an export is being read. */
export function TypingDots() {
  return (
    <span className="typing-dots" aria-hidden="true">
      <span style={{ '--n': 0 }} />
      <span style={{ '--n': 1 }} />
      <span style={{ '--n': 2 }} />
    </span>
  );
}

export function LockDoodle({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7.6 10.6C7.3 7.4 8.9 4.3 12.2 4.4C15.3 4.5 16.6 7.3 16.4 10.4" />
      <path d="M5.4 11.2C9.6 10.5 14.6 10.6 18.7 11.1C19.2 14.2 19 17.3 18.5 20C14.4 20.6 9.7 20.6 5.6 20.1C5 17.2 4.9 14.1 5.4 11.2Z" />
      <path d="M12 14.6V16.6" />
    </svg>
  );
}

// Same family of shapes as the logo's background
const SHAPES = {
  star: 'M12 2.8L14.4 9.2L21.2 9.6L15.9 13.9L17.8 20.6L12 16.8L6.1 20.4L8.2 13.8L2.9 9.4L9.6 9.1Z',
  crown: 'M3.5 18.5L4.6 7.2L9 12.4L12.2 4.8L15.3 12.3L19.6 7L20.6 18.6C15 19.3 9.1 19.2 3.5 18.5Z',
  blob: 'M12.4 4.2C17.3 4 20.6 7.6 20 12.5C19.5 17.1 15.8 20.3 11.3 19.9C6.6 19.5 3.7 15.9 4.2 11.3C4.6 7.2 8 4.4 12.4 4.2Z',
  squiggle: 'M2.5 13C5 7.5 7.4 18.5 10.2 12.6C12.8 7.2 15.4 18.2 18.1 12.4C19.2 10.2 20.4 10 21.5 11',
  spark: 'M12 3.5V20.5M4.6 7.6L19.4 16.4M19.4 7.6L4.6 16.4',
};

// Positions as % of the page. Large screens scatter them through the
// margins; phones have no margins, so only the gaps beside the headline
// and below the export help get one.
const WIDE = [
  { shape: 'star', top: 7, left: 4, size: 30, rotate: -14 },
  { shape: 'crown', top: 4, left: 44, size: 26, rotate: 8 },
  { shape: 'blob', top: 15, left: 92, size: 22, rotate: 0 },
  { shape: 'squiggle', top: 31, left: 2, size: 34, rotate: -6 },
  { shape: 'spark', top: 46, left: 94, size: 20, rotate: 12 },
  { shape: 'star', top: 62, left: 46, size: 22, rotate: 18 },
  { shape: 'crown', top: 72, left: 5, size: 28, rotate: -10 },
  { shape: 'blob', top: 84, left: 34, size: 18, rotate: 0 },
  { shape: 'star', top: 88, left: 90, size: 32, rotate: 6 },
  { shape: 'squiggle', top: 94, left: 62, size: 30, rotate: 4 },
];

const NARROW = [
  { shape: 'star', top: 11, left: 78, size: 28, rotate: 10 },
  { shape: 'blob', top: 19, left: 89, size: 16, rotate: 0 },
  { shape: 'crown', top: 96, left: 10, size: 24, rotate: -8 },
  { shape: 'squiggle', top: 96.5, left: 74, size: 28, rotate: 4 },
];

function Doodle({ shape, top, left, size, rotate }) {
  return (
    <svg viewBox="0 0 24 24" style={{ top: `${top}%`, left: `${left}%`, width: size, height: size, rotate: `${rotate}deg` }}>
      <path d={SHAPES[shape]} />
    </svg>
  );
}

/** Faint doodles behind the landing screen. */
export function DoodleField() {
  return (
    <div className="doodle-field" aria-hidden="true">
      <div className="hidden lg:contents">
        {WIDE.map((d, i) => <Doodle key={i} {...d} />)}
      </div>
      <div className="contents lg:hidden">
        {NARROW.map((d, i) => <Doodle key={i} {...d} />)}
      </div>
    </div>
  );
}
