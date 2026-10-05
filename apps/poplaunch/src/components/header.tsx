"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function Wordmark() {
  return (
    <Link href="/" className="inline-flex items-baseline gap-1.5 rounded-lg" aria-label="Pop Launch home">
      <span className="display text-[28px] leading-none tracking-tight">pop<span className="text-coral">.</span></span>
      <span className="font-display font-extrabold text-[11px] uppercase tracking-[0.18em] text-muted">launch</span>
    </Link>
  );
}

export function Header() {
  const [menu, setMenu] = useState(false);
  const [walletNote, setWalletNote] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setMenu(false); setWalletNote(false); } };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenu(false); setWalletNote(false); } };
    document.addEventListener("click", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", esc); };
  }, []);
  const links = [
    { href: "/#launches", label: "Explore" },
    { href: "/#how", label: "How it works" },
    { href: "/#create", label: "Create a coin" },
  ];
  return (
    <header className="bg-bg sticky top-0 z-30" ref={ref}>
      <div className="mx-auto max-w-[1200px] px-4 md:px-8 h-[64px] md:h-[76px] flex items-center gap-3 md:gap-6">
        <Wordmark />
        <nav className="hidden md:flex items-center gap-7 ml-4" aria-label="Primary">
          {links.map((l) => <Link key={l.href} href={l.href} className="font-display font-extrabold text-[15px] text-ink/85 hover:text-ink">{l.label}</Link>)}
        </nav>
        <div className="ml-auto flex items-center gap-1 md:gap-2 relative">
          <button type="button" className="btn btn-sm md:btn px-3 md:px-5" aria-haspopup="dialog" aria-expanded={walletNote} onClick={() => setWalletNote((v) => !v)}>
            <span className="w-2 h-2 rounded-full bg-lilac" aria-hidden />Connect wallet
          </button>
          {walletNote && (
            <div role="dialog" aria-label="Wallet connection" className="card-sm absolute right-0 top-12 w-72 p-4 text-sm shadow-lg z-40">
              <div className="font-display font-extrabold">Browsing needs no wallet.</div>
              <p className="label mt-1">This is the Stage 1 visual preview. Wallet connection and backing arrive in Stage 3, after the on-chain mechanism is proven.</p>
            </div>
          )}
          <button type="button" className="btn btn-ghost btn-sm md:hidden w-11 px-0" aria-label="Menu" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M3 5h14M3 10h14M3 15h14" /></svg>
          </button>
          {menu && (
            <div role="menu" className="card-sm absolute right-0 top-12 w-56 p-2 shadow-lg z-40 md:hidden">
              {links.map((l) => <Link key={l.href} role="menuitem" href={l.href} className="block px-3 py-2.5 rounded-xl font-display font-extrabold hover:bg-bg" onClick={() => setMenu(false)}>{l.label}</Link>)}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
