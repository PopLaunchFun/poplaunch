"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./wallet-button";

const items = [
  { href: "/", label: "Explore", match: (p: string) => p === "/" || p.startsWith("/coin") },
  { href: "/launch", label: "Launch coin", match: (p: string) => p.startsWith("/launch") },
  { href: "/my-launches", label: "My launches", match: (p: string) => p.startsWith("/my-launches") },
];

export function Nav({ network }: { network: string }) {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur">
      <div className="relative max-w-[1400px] mx-auto px-4 md:px-6 h-14 flex items-center gap-4">
        <div className="absolute inset-0 grid-bg pointer-events-none" aria-hidden />
        <Link href="/" className="relative flex items-baseline gap-2">
          <span className="wordmark text-2xl">POP</span>
          <span className="hidden sm:inline label">Proof of Pain</span>
        </Link>
        <nav className="relative flex items-center gap-1 ml-2 overflow-x-auto whitespace-nowrap">
          {items.map((i) => (
            <Link key={i.href} href={i.href} className={`px-3 py-1.5 rounded-lg text-sm ${i.match(path) ? "bg-green-dim text-green" : "text-muted hover:text-text"}`}>
              {i.label}
            </Link>
          ))}
        </nav>
        <div className="relative ml-auto flex items-center gap-3">
          <span className="chip hidden sm:inline-flex" title="Network this site is configured for">{network}</span>
          <WalletButton compact />
        </div>
      </div>
    </header>
  );
}
