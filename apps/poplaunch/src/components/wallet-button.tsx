"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { DEMO, IS_LOCALNET } from "@/lib/config";
import { short } from "@/lib/launch";
import { WalletIcon } from "./art";

export function WalletButton() {
  const { wallets, select, connect, disconnect, connected, publicKey, connecting, wallet } = useWallet();
  const { connection } = useConnection();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", esc); };
  }, []);
  useEffect(() => {
    if (!publicKey) { setBalance(null); return; }
    let alive = true;
    const load = () => connection.getBalance(publicKey).then((b) => { if (alive) setBalance(b); }).catch(() => {});
    load();
    const id = setInterval(load, 8000);
    return () => { alive = false; clearInterval(id); };
  }, [publicKey, connection, open]);

  // Selecting a wallet lets the provider auto-connect it (its listeners attach after this component's effects).
  // If that has not happened shortly after, connect explicitly from a timer so it runs after the provider's effects.
  useEffect(() => {
    if (!busy) return;
    if (connected) { setBusy(false); return; }
    const t = setTimeout(() => {
      if (wallet && !connected && !connecting) connect().catch(() => {}).finally(() => setBusy(false));
      else setBusy(false);
    }, 800);
    return () => clearTimeout(t);
  }, [wallet, connected, connecting, busy, connect]);

  const pick = (name: WalletName) => {
    setOpen(false);
    setBusy(true);
    select(name);
  };

  return (
    <div className="relative" ref={ref}>
      {connected && publicKey ? (
        <button type="button" className="btn btn-sm px-3 md:min-h-12 md:px-5 md:text-[17px]" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={`Wallet ${publicKey.toBase58()}`}>
          <span className="w-2.5 h-2.5 rounded-full bg-green border-2 border-ink" aria-hidden />
          <span className="addr">{short(publicKey.toBase58())}</span>
        </button>
      ) : (
        <button type="button" className="btn btn-red btn-sm px-2.5 md:min-h-12 md:px-6 md:text-[18px]" onClick={() => setOpen((o) => !o)} disabled={connecting || busy} aria-haspopup="menu" aria-expanded={open}>
          <WalletIcon /><span className="hidden sm:inline">{connecting || busy ? "Connecting…" : "Connect wallet"}</span><span className="sm:hidden">{connecting || busy ? "…" : "Connect"}</span>
        </button>
      )}
      {open && (
        <div role="menu" className="box absolute right-0 top-14 w-72 p-2 z-40 text-[15px]">
          {DEMO ? (
            <div className="p-3">
              <div className="font-bold">Browsing needs no wallet.</div>
              <p className="label mt-1">This is the demo preview. Wallet connection works in the localnet and devnet builds.</p>
            </div>
          ) : connected && publicKey ? (
            <>
              <div className="px-3 py-2">
                <div className="addr break-all text-[13px]">{publicKey.toBase58()}</div>
                <div className="label num mt-1">{balance === null ? "…" : `${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`}</div>
              </div>
              <Link role="menuitem" href="/my-pops" className="block px-3 py-2.5 rounded-lg font-bold hover:bg-bg" onClick={() => setOpen(false)}>My pops</Link>
              {IS_LOCALNET && wallet?.adapter.name.startsWith("Dev wallet") && (
                <button role="menuitem" className="block w-full text-left px-3 py-2.5 rounded-lg font-bold hover:bg-bg" onClick={async () => { setOpen(false); const sig = await connection.requestAirdrop(publicKey, 5 * LAMPORTS_PER_SOL); await connection.confirmTransaction({ signature: sig, ...(await connection.getLatestBlockhash()) }, "confirmed"); setBalance(await connection.getBalance(publicKey)); }}>
                  Airdrop 5 test SOL
                </button>
              )}
              <button role="menuitem" className="block w-full text-left px-3 py-2.5 rounded-lg font-bold hover:bg-bg" onClick={() => { setOpen(false); void disconnect(); }}>Disconnect</button>
            </>
          ) : (
            <>
              {wallets.filter((w) => w.readyState === "Installed" || w.readyState === "Loadable").length === 0 && <div className="label p-3">No wallet detected. Install Phantom or Solflare, then reload.</div>}
              {wallets.map((w) => (
                <button key={w.adapter.name} role="menuitem" className="flex w-full items-center justify-between px-3 py-2.5 rounded-lg font-bold hover:bg-bg disabled:opacity-50" disabled={w.readyState !== "Installed" && w.readyState !== "Loadable"} onClick={() => pick(w.adapter.name)}>
                  <span>{w.adapter.name}</span>
                  <span className="label">{w.readyState === "Installed" ? "installed" : w.readyState === "Loadable" ? "available" : "not found"}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
