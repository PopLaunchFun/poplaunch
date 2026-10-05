"use client";
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";
import { short } from "@/lib/format";

export function WalletButton({ compact = false }: { compact?: boolean }) {
  const { wallets, select, connect, disconnect, connected, publicKey, connecting, wallet } = useWallet();
  const [open, setOpen] = useState(false);
  if (connected && publicKey) {
    return (
      <button className={`btn w-full ${compact ? "text-xs px-2 py-1" : ""}`} onClick={() => void disconnect()} title="Disconnect">
        <span className="num">{short(publicKey.toBase58())}</span>
      </button>
    );
  }
  return (
    <div className="relative">
      <button className={`btn btn-primary w-full ${compact ? "text-xs px-2 py-1" : ""}`} onClick={() => setOpen((o) => !o)} disabled={connecting}>
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 panel p-2 z-30 w-48">
          {wallets.length === 0 && <div className="text-xs text-paper-3 p-2">No wallet-standard wallets detected. Install Phantom or Solflare.</div>}
          {wallets.map((w) => (
            <button
              key={w.adapter.name}
              className="w-full text-left px-2 py-2 rounded hover:bg-ink-3 text-sm"
              onClick={async () => {
                setOpen(false);
                select(w.adapter.name as WalletName);
                try {
                  if (wallet?.adapter.name === w.adapter.name) await connect();
                } catch {
                  /* user rejected */
                }
              }}
            >
              {w.adapter.name} <span className="text-paper-3 text-xs">{w.readyState}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
