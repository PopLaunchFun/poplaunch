/** Deterministic demo avatar: ticker initials on a tinted disc. Real launches will use the creator's uploaded image. */
export function Avatar({ name, ticker, hue, size = 56 }: { name: string; ticker: string; hue: number; size?: number }) {
  const letters = ticker.slice(0, 2).toUpperCase();
  return (
    <div
      className="shrink-0 rounded-full flex items-center justify-center display"
      style={{ width: size, height: size, background: `hsl(${hue} 85% 88%)`, color: `hsl(${hue} 45% 28%)`, fontSize: Math.round(size * 0.36), boxShadow: `inset 0 -3px 0 hsl(${hue} 60% 78%)` }}
      role="img"
      aria-label={`${name} avatar`}
    >
      {letters}
    </div>
  );
}
