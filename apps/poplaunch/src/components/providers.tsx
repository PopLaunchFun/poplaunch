"use client";
import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import type { Adapter } from "@solana/wallet-adapter-base";
import { DEMO, IS_LOCALNET, RPC_URL } from "@/lib/config";
import { DevWalletAdapter } from "@/lib/dev-wallet-adapter";

export function Providers({ children }: { children: React.ReactNode }) {
  const wallets = useMemo<Adapter[]>(() => {
    if (DEMO) return [];
    const list: Adapter[] = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];
    if (IS_LOCALNET) list.push(new DevWalletAdapter());
    return list;
  }, []);
  return (
    <ConnectionProvider endpoint={RPC_URL} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect={!DEMO}>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
