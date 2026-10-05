"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { WalletButton } from "./wallet-button";

const NAV = [
  { href: "/", label: "Explore", match: (p: string) => p === "/" || p.startsWith("/coin") },
  { href: "/my-launches", label: "My launches", match: (p: string) => p.startsWith("/my-launches") },
];
const MORE = [
  { href: "/launch", label: "Launch coin" },
  { href: "/my-launches", label: "My launches" },
  { href: "/mechanism", label: "How it works" },
  { href: "/status", label: "Status" },
];

export function Header({ network }: { network: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  const testNet = network !== "mainnet-beta";
  return (
    <header className="sticky top-0 z-20 bg-nav border-b border-line">
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 h-[60px] md:h-[68px] flex items-center gap-6">
        <Link href="/" className="wordmark text-[23px] md:text-[24px] leading-none" aria-label="POP home">POP</Link>
        <nav className="hidden md:flex items-center gap-5" aria-label="Primary">
          {NAV.map((i) => (
            <Link key={i.href} href={i.href} className={`text-[14px] font-medium py-2 ${i.match(path) ? "text-text border-b-2 border-green -mb-[2px]" : "text-muted hover:text-text"}`} aria-current={i.match(path) ? "page" : undefined}>
              {i.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <Link href="/launch" className="btn btn-green hidden md:inline-flex">Launch coin</Link>
          <WalletButton />
          <div className="relative md:hidden" ref={ref}>
            <button className="btn btn-ghost w-9 px-0" aria-label="Menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M2 4.5h14M2 9h14M2 13.5h14" /></svg>
            </button>
            {open && (
              <div className="menu absolute right-0 mt-2 z-30" role="menu">
                {MORE.map((m) => <Link key={m.href} href={m.href} role="menuitem" className="menu-item" onClick={() => setOpen(false)}>{m.label}</Link>)}
              </div>
            )}
          </div>
        </div>
      </div>
      {testNet && (
        <div className="bg-raised border-t border-line text-[12px] text-muted" role="status">
          <div className="max-w-[1280px] mx-auto px-4 md:px-8 h-7 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-neg" aria-hidden />
            <span>Test network · no real funds</span>
            <span className="text-muted/70">({network})</span>
          </div>
        </div>
      )}
    </header>
  );
}
