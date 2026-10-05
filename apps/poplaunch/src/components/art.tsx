/* Decorative artwork recreated from the mockup as SVG: clouds, sparkle accents, wordmark burst, squiggle, icons. */

export function Cloud({ className = "", width = 200 }: { className?: string; width?: number }) {
  return (
    <svg className={className} width={width} viewBox="0 0 200 80" fill="none" aria-hidden>
      <path d="M10 80 C 6 60, 22 48, 40 52 C 44 34, 66 26, 82 36 C 92 14, 128 12, 142 34 C 160 26, 184 40, 180 58 C 196 60, 200 72, 196 80 Z" fill="#fff" stroke="#000" strokeWidth="4" strokeLinejoin="round" />
    </svg>
  );
}

export function Sparkle({ className = "", size = 36, flip = false }: { className?: string; size?: number; flip?: boolean }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 40 40" fill="none" stroke="#000" strokeWidth="4" strokeLinecap="round" aria-hidden style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M6 10 L 16 18" /><path d="M4 26 L 16 24" /><path d="M24 4 L 22 16" />
    </svg>
  );
}

export function Chevrons({ className = "", size = 36 }: { className?: string; size?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 40 40" fill="none" stroke="#000" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8 L 18 14" /><path d="M6 24 L 18 18" />
    </svg>
  );
}

export function Burst({ className = "", size = 26 }: { className?: string; size?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 30 30" aria-hidden>
      <path d="M15 1 L18 9 L26 4 L21 12 L29 15 L21 18 L26 26 L18 21 L15 29 L12 21 L4 26 L9 18 L1 15 L9 12 L4 4 L12 9 Z" fill="#fb473b" />
    </svg>
  );
}

export function Squiggle({ className = "", size = 40 }: { className?: string; size?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 40 40" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 10 L 30 6 L 8 30 L 32 28 M 24 34 l 4 -2" />
    </svg>
  );
}

export function WalletIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" aria-hidden>
      <rect x="2.5" y="6" width="19" height="13" rx="2.5" /><path d="M15 12.5h6" /><circle cx="16" cy="12.5" r="1" fill="currentColor" />
    </svg>
  );
}

export function ClockIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="9.5" /><path d="M12 7v5.5l3.5 2" />
    </svg>
  );
}

export function ArrowRight({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

/** Balloon string, hanging from the knot and curling to the right like the mockup. */
export function BalloonString({ className = "", height = 60 }: { className?: string; height?: number }) {
  return (
    <svg className={className} width={height * 0.6} height={height} viewBox="0 0 36 60" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" aria-hidden>
      <path d="M8 2 C 2 14, 22 22, 12 36 C 6 46, 20 50, 30 58" />
    </svg>
  );
}
