"use client";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";
import { short } from "@/lib/format";

export function WalletButton() {
  const { wallets, select, connect, disconnect, connected, publicKey, connecting, wallet } = useWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  return (
    <div className="relative" ref={ref}>
      {connected && publicKey ? (
        <button className="btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={`Wallet ${publicKey.toBase58()}`}>
          <span className="w-2 h-2 rounded-full bg-green" aria-hidden />
          <span className="addr">{short(publicKey.toBase58())}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M3 4.5l3 3 3-3" /></svg>
        </button>
      ) : (
        <button className="btn" onClick={() => setOpen((o) => !o)} disabled={connecting} aria-haspopup="menu" aria-expanded={open}>
          {connecting ? "Connecting…" : "Connect"}
        </button>
      )}
      {open && (
        <div className="menu absolute right-0 mt-2 z-30" role="menu">
          {connected ? (
            <button role="menuitem" className="menu-item" onClick={() => { setOpen(false); void disconnect(); }}>Disconnect</button>
          ) : (
            <>
              {wallets.length === 0 && <div className="text-[12px] text-muted p-2">No wallet detected. Install Phantom or Solflare.</div>}
              {wallets.map((w) => (
                <button key={w.adapter.name} role="menuitem" className="menu-item" onClick={async () => { setOpen(false); select(w.adapter.name as WalletName); try { if (wallet?.adapter.name === w.adapter.name) await connect(); } catch { /* rejected */ } }}>
                  <span>{w.adapter.name}</span>
                  <span className="text-muted text-[12px]">{w.readyState === "Installed" ? "installed" : "not found"}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
