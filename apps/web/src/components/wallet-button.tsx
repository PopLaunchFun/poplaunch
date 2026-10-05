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
      <button className={`btn ${compact ? "btn-sm" : ""}`} onClick={() => void disconnect()} title="Disconnect">
        <span className="w-2 h-2 rounded-full bg-green" aria-hidden />
        <span className="num">{short(publicKey.toBase58())}</span>
      </button>
    );
  }
  return (
    <div className="relative">
      <button className={`btn btn-green ${compact ? "btn-sm" : ""}`} onClick={() => setOpen((o) => !o)} disabled={connecting} aria-haspopup="menu" aria-expanded={open}>
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 panel p-1.5 z-30 w-52" role="menu">
          {wallets.length === 0 && <div className="text-xs text-muted p-2">No wallet-standard wallets detected. Install Phantom or Solflare.</div>}
          {wallets.map((w) => (
            <button
              key={w.adapter.name}
              role="menuitem"
              className="w-full text-left px-2 py-2 rounded-lg hover:bg-raised text-sm flex justify-between"
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
              <span>{w.adapter.name}</span>
              <span className="text-muted text-xs">{w.readyState === "Installed" ? "installed" : w.readyState.toLowerCase()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
