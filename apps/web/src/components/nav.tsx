"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./wallet-button";

const items = [
  { href: "/", label: "Home" },
  { href: "/markets", label: "Markets" },
  { href: "/launch", label: "Launch" },
  { href: "/pop", label: "POP token" },
  { href: "/mechanism", label: "Mechanism" },
  { href: "/lab", label: "Lab" },
  { href: "/status", label: "Status" },
];

export function Nav({ network }: { network: string }) {
  const path = usePathname();
  return (
    <>
      <aside className="hidden md:flex flex-col border-r border-line sticky top-0 h-screen px-5 py-6">
        <Link href="/" className="wordmark text-4xl">POP</Link>
        <div className="label mt-2">Proof of Pain · {network}</div>
        <nav className="mt-8 flex flex-col gap-1">
          {items.map((i) => (
            <Link key={i.href} href={i.href} className={`px-3 py-2 rounded ${path === i.href || (i.href !== "/" && path.startsWith(i.href)) ? "bg-ink-3 text-paper" : "text-paper-2 hover:text-paper"}`}>
              {i.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto">
          <WalletButton />
          <p className="text-xs text-paper-3 mt-4 leading-relaxed">Experimental protocol. Nothing here is a guarantee of liquidity, price, or revenue.</p>
        </div>
      </aside>
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-line sticky top-0 bg-ink z-20">
        <Link href="/" className="wordmark text-2xl">POP</Link>
        <nav className="flex gap-3 overflow-x-auto text-sm">
          {items.slice(1).map((i) => (
            <Link key={i.href} href={i.href} className={path.startsWith(i.href) ? "text-paper" : "text-paper-3"}>{i.label}</Link>
          ))}
        </nav>
        <WalletButton compact />
      </header>
    </>
  );
}
