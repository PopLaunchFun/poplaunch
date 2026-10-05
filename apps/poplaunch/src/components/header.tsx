"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { DEMO } from "@/lib/config";
import { Burst } from "./art";
import { WalletButton } from "./wallet-button";

export function Wordmark({ size = 48 }: { size?: number }) {
  return (
    <Link href="/" className="relative inline-flex items-baseline rounded-md whitespace-nowrap" aria-label="Pop Launch home">
      <span className="wordmark text-[28px] sm:text-[32px] md:text-[54px]">
        pop
        <span className="relative inline-block w-0" aria-hidden>
          <Burst className="absolute" size={Math.round(size * 0.52)} />
          <style>{`.wordmark svg { left: -9px; top: -27px; width: 16px; height: 16px; } @media (min-width: 768px) { .wordmark svg { left: -19px; top: -54px; width: 30px; height: 30px; } }`}</style>
        </span>
        &nbsp;launch
      </span>
    </Link>
  );
}

export function Header() {
  const path = usePathname();
  const { connected } = useWallet();
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", esc); };
  }, []);
  const links = [
    { href: "/", label: "Explore", current: path === "/" || path.startsWith("/launch") },
    { href: "/how-it-works", label: "How it works", current: path.startsWith("/how-it-works") },
    { href: "/create", label: "Create a coin", current: path.startsWith("/create") },
    ...(connected && !DEMO ? [{ href: "/my-pops", label: "My pops", current: path.startsWith("/my-pops") }] : []),
  ];
  return (
    <header className="bg-bg border-b-[3px] border-ink sticky top-0 z-30">
      <div className="relative mx-auto max-w-[1536px] px-4 md:px-[62px] h-[72px] md:h-[92px] flex items-center">
        <Wordmark />
        <nav className="hidden md:flex items-center gap-10 absolute left-1/2 -translate-x-1/2" aria-label="Primary">
          {links.map((l) => <Link key={l.href} href={l.href} className="nav-link" aria-current={l.current ? "page" : undefined}>{l.label}</Link>)}
        </nav>
        <div className="ml-auto flex items-center gap-1.5 md:gap-2 relative pl-2" ref={ref}>
          <WalletButton />
          <button type="button" className="btn btn-plain btn-sm md:hidden w-10 px-0" aria-label="Menu" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden><path d="M3 6h16M3 11h16M3 16h16" /></svg>
          </button>
          {menu && (
            <div role="menu" className="box absolute right-0 top-14 w-56 p-2 z-40 md:hidden">
              {links.map((l) => <Link key={l.href} role="menuitem" href={l.href} className="block px-3 py-2.5 rounded-lg font-bold hover:bg-bg" onClick={() => setMenu(false)}>{l.label}</Link>)}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
