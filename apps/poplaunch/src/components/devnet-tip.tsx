"use client";
/**
 * Devnet builds only. A website cannot change which network Phantom is on; that is a wallet setting
 * Phantom keeps out of a site's reach. Transactions from this site are signed by the wallet and sent by
 * us to devnet either way, but a wallet left on mainnet shows warnings and the wrong balance. So we say
 * exactly where the switch is, once per browser.
 */
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { NETWORK } from "@/lib/config";

const KEY = "poplaunch.devnet-tip.dismissed";

export function DevnetTip() {
  const { connected, wallet } = useWallet();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try { setHidden(localStorage.getItem(KEY) === "1"); } catch { setHidden(false); }
  }, []);
  if (NETWORK !== "devnet" || !connected || hidden) return null;
  const name = wallet?.adapter.name ?? "your wallet";
  const steps = name.startsWith("Solflare")
    ? "In Solflare: Settings → General → Network → Devnet."
    : "In Phantom: Settings → Developer Settings → turn on Testnet Mode (it uses devnet).";
  return (
    <div className="bg-yellow border-b-[3px] border-ink" role="status">
      <div className="mx-auto max-w-[1536px] px-4 md:px-[62px] py-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px]">
        <span className="font-bold">This is the devnet test site: put {name} on devnet too.</span>
        <span className="text-muted">{steps} Your test SOL and the coins you claim will only show in the wallet while it is on devnet. Everything you sign here is sent to devnet regardless.</span>
        <button type="button" className="btn btn-sm ml-auto" onClick={() => { try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ } setHidden(true); }}>Got it</button>
      </div>
    </div>
  );
}
