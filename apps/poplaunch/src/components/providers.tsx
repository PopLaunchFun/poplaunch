"use client";
import { useEffect, useMemo, useState } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import type { Adapter } from "@solana/wallet-adapter-base";
import { DEMO, IS_LOCALNET, RPC_URL } from "@/lib/config";

export function Providers({ children }: { children: React.ReactNode }) {
  const base = useMemo<Adapter[]>(() => (DEMO ? [] : [new PhantomWalletAdapter(), new SolflareWalletAdapter()]), []);
  const [wallets, setWallets] = useState<Adapter[]>(base);
  // The localStorage Dev wallet is loaded dynamically and only on localnet, so it is not even in other bundles.
  useEffect(() => {
    if (!IS_LOCALNET || DEMO) return;
    let alive = true;
    import("@/lib/dev-wallet-adapter").then((m) => { if (alive) setWallets([...base, new m.DevWalletAdapter()]); });
    return () => { alive = false; };
  }, [base]);
  return (
    <ConnectionProvider endpoint={RPC_URL} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect={!DEMO}>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
