export function DemoBanner() {
  return (
    <div className="bg-yellow text-ink" role="status">
      <div className="mx-auto max-w-[1200px] px-4 md:px-8 min-h-9 py-1.5 flex items-center gap-2 text-[13px] md:text-sm">
        <span className="pill bg-ink text-white text-[11px]">Demo</span>
        <span>Example launches with made-up numbers. No wallet, no real SOL, nothing on chain.</span>
      </div>
    </div>
  );
}
