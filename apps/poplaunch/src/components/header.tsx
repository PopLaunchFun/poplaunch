"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { CONTRACT_ADDRESS, DEMO } from "@/lib/config";
import { Burst } from "./art";
import { WalletButton } from "./wallet-button";

export function Wordmark({ size = 48 }: { size?: number }) {
  return (
    <Link href="/" className="relative inline-flex items-baseline rounded-md whitespace-nowrap" aria-label="Pop Launch home">
      <span className="wordmark text-[25px] sm:text-[32px] md:text-[54px]">
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
    { href: "/create", label: "Launch", current: path.startsWith("/create") },
    ...(connected && !DEMO ? [{ href: "/my-pops", label: "My pops", current: path.startsWith("/my-pops") }] : []),
    { href: "/how-it-works", label: "How it works", current: path.startsWith("/how-it-works") },
  ];
  return (
    <header className="bg-bg border-b-[3px] border-ink sticky top-0 z-30">
      <div className="relative mx-auto max-w-[1536px] px-3 md:px-[62px] h-[72px] md:h-[92px] flex items-center">
        <Wordmark />
        <nav className="hidden md:flex items-center gap-10 absolute left-1/2 -translate-x-1/2" aria-label="Primary">
          {links.map((l) => <Link key={l.href} href={l.href} className="nav-link" aria-current={l.current ? "page" : undefined}>{l.label}</Link>)}
        </nav>
        <div className="ml-auto flex items-center gap-1 md:gap-2 relative pl-1" ref={ref}>
          <ContractChip />
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

/** Copyable contract-address chip. Shows "CA soon" until NEXT_PUBLIC_CONTRACT_ADDRESS is set. */
export function ContractChip() {
  const [copied, setCopied] = useState(false);
  if (!CONTRACT_ADDRESS) {
    return <span className="btn btn-sm px-2.5 md:min-h-12 md:px-4 md:text-[16px] opacity-70 cursor-default" title="Contract address will be published here" aria-disabled="true">CA <span className="label hidden sm:inline">soon</span></span>;
  }
  const short = `${CONTRACT_ADDRESS.slice(0, 4)}…${CONTRACT_ADDRESS.slice(-4)}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(CONTRACT_ADDRESS); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ }
  };
  return (
    <button type="button" className="btn btn-sm px-2.5 md:min-h-12 md:px-4 md:text-[16px]" onClick={copy} aria-label={`Copy contract address ${CONTRACT_ADDRESS}`} title={CONTRACT_ADDRESS}>
      <span className="font-extrabold">CA</span><span className="addr hidden sm:inline">{copied ? "Copied" : short}</span>{copied && <span className="sm:hidden">✓</span>}
    </button>
  );
}
