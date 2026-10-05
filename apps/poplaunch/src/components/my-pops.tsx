"use client";
/** Every launch this wallet backed or created, each with its one relevant action. Reads receipts from chain when the index is stale. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { api, toLaunch, type HistoryItem, type WalletEntry } from "@/lib/api";
import { fetchLaunchFromChain, readClient } from "@/lib/chain";
import { explorerTx } from "@/lib/config";
import { type Launch, fmtSol, fmtTokens, short } from "@/lib/launch";
import { entitlement } from "@pop/sdk";
import { BalloonFrame } from "./balloon-frame";
import { Countdown } from "./countdown";
import { ArrowRight } from "./art";

type Tab = "active" | "claimable" | "refundable" | "created";
interface Entry { launch: Launch; contributed: bigint; claimed: bigint; refunded: bigint; entitled: bigint; action: WalletEntry["action"] }

export function MyPops() {
  const { publicKey, connected } = useWallet();
  const [tab, setTab] = useState<Tab>("active");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [created, setCreated] = useState<Launch[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [drafts, setDrafts] = useState<{ mint: string; name: string; symbol: string }[]>([]);
  const [source, setSource] = useState<"index" | "chain">("index");

  useEffect(() => {
    if (!publicKey) { setEntries(null); return; }
    let alive = true;
    const load = async () => {
      const r = await api.wallet(publicKey.toBase58());
      if (!alive) return;
      if (r) {
        setEntries(r.entries.map((e) => ({ launch: toLaunch(e.launch), contributed: BigInt(e.receipt.contributed), claimed: BigInt(e.receipt.claimed), refunded: BigInt(e.receipt.refunded), entitled: BigInt(e.receipt.entitled), action: e.action })));
        setCreated(r.created.map(toLaunch));
        setHistory(r.history);
        setDrafts(r.drafts);
        setSource("index");
        return;
      }
      // Index down: receipts straight from the chain.
      try {
        const rs = await readClient().fetchReceiptsByOwner(publicKey);
        const out: Entry[] = [];
        for (const { account } of rs) {
          const la = await readClient().fetchLaunch(account.launch as PublicKey);
          const l = await fetchLaunchFromChain((la.mint as PublicKey).toBase58());
          if (!l) continue;
          const contributed = BigInt(account.contributedLamports.toString()), claimed = BigInt(account.claimedBaseUnits.toString()), refunded = BigInt(account.refundedLamports.toString());
          const entitled = entitlement(contributed, BigInt(l.targetLamports), BigInt(l.backerAllocation ?? "0"));
          out.push({ launch: l, contributed, claimed, refunded, entitled, action: l.state === "live" && entitled > claimed ? "claim" : l.state === "refundable" && contributed > refunded ? "refund" : l.state === "funding" || l.state === "ready" ? "wait" : "done" });
        }
        if (alive) { setEntries(out); setSource("chain"); }
      } catch { if (alive) setEntries([]); }
    };
    void load();
    const id = setInterval(load, 8000);
    return () => { alive = false; clearInterval(id); };
  }, [publicKey]);

  if (!connected || !publicKey) {
    return <div className="box p-6 mt-6 max-w-[560px]"><div className="font-bold">Connect a wallet</div><p className="label mt-1">My pops shows every launch the connected wallet backed or created, with the one action that matters for each.</p></div>;
  }
  if (entries === null) return <p className="label mt-6">Loading your pops…</p>;

  const lists: Record<Tab, Entry[]> = {
    active: entries.filter((e) => e.action === "wait"),
    claimable: entries.filter((e) => e.action === "claim"),
    refundable: entries.filter((e) => e.action === "refund"),
    created: created.map((l) => ({ launch: l, contributed: 0n, claimed: 0n, refunded: 0n, entitled: 0n, action: "done" as const })),
  };
  const dec = (l: Launch) => l.decimals ?? 6;
  return (
    <div className="mt-6">
      {source === "chain" && <p className="tag tag-yellow mb-4" role="status">The launch index is unreachable; receipts are being read from the chain. Created launches and history are unavailable until it returns.</p>}
      <div role="tablist" aria-label="My pops" className="flex gap-1 flex-wrap">
        {(["active", "claimable", "refundable", "created"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className="tab" onClick={() => setTab(t)}>{t[0]!.toUpperCase() + t.slice(1)} <span className="label">({lists[t].length})</span></button>
        ))}
      </div>
      {drafts.length > 0 && tab === "created" && (
        <p className="label mt-3">Unpublished drafts: {drafts.map((d) => `${d.name} (${d.symbol})`).join(", ")}. Drafts cost nothing; publish them from <Link href="/create" className="link">Create a coin</Link>.</p>
      )}
      {lists[tab].length === 0 ? (
        <div className="box p-8 mt-5 text-center">
          <div className="display text-[26px]">{tab === "created" ? "You have not created a coin yet." : "Nothing here right now."}</div>
          <Link href={tab === "created" ? "/create" : "/"} className="btn btn-red mt-4">{tab === "created" ? "Create a coin" : "Explore launches"} <ArrowRight /></Link>
        </div>
      ) : (
        <ul className="mt-5 space-y-[18px]" role="list">
          {lists[tab].map((e) => {
            const l = e.launch;
            return (
              <li key={l.mint} className="box bg-surface p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex items-center gap-4 min-w-0 md:w-[360px]">
                  <BalloonFrame l={l} size={70} className="w-[70px] shrink-0" />
                  <div className="min-w-0">
                    <div className="display text-[24px] truncate">{l.name}</div>
                    <div className="mono text-[13px] truncate">${l.ticker} · <span className="addr">{short(l.mint, 6)}</span></div>
                  </div>
                </div>
                <div className="text-[15px] md:flex-1 grid grid-cols-2 gap-x-6 gap-y-1">
                  <span className="text-muted">Status</span><span className="font-bold">{l.state === "funding" ? "Filling up" : l.state === "ready" ? "Getting ready" : l.state === "live" ? "Live" : "Refund available"}</span>
                  {tab !== "created" && <><span className="text-muted">Backed</span><span className="num">{fmtSol(e.contributed)} SOL</span></>}
                  {tab === "claimable" && <><span className="text-muted">Claimable</span><span className="num">{fmtTokens(e.entitled - e.claimed, dec(l))} {l.ticker}</span></>}
                  {tab === "refundable" && <><span className="text-muted">Reclaimable</span><span className="num">{fmtSol(e.contributed - e.refunded)} SOL</span></>}
                  {tab === "active" && l.state === "funding" && <><span className="text-muted">Time left</span><span className="num"><Countdown deadline={l.fundingDeadline} suffix="" /></span></>}
                  {tab === "created" && <><span className="text-muted">Raised</span><span className="num">{fmtSol(BigInt(l.raisedLamports), 2)} / {fmtSol(BigInt(l.targetLamports), 0)} SOL</span></>}
                </div>
                <Link href={`/launch/${l.mint}`} className={`btn ${e.action === "claim" || e.action === "refund" ? "btn-red" : ""} md:w-[220px]`}>
                  {e.action === "claim" ? `Claim ${l.ticker}` : e.action === "refund" ? "Reclaim SOL" : l.state === "ready" ? "View settlement" : tab === "created" ? "Manage" : "View"} <ArrowRight />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {history.length > 0 && (
        <details className="box p-5 mt-8">
          <summary className="display text-[20px]">Transaction history</summary>
          <ul className="mt-3 space-y-1.5 text-[14px]">
            {history.map((h) => (
              <li key={`${h.signature}-${h.name}`} className="flex flex-wrap gap-x-3 gap-y-0.5">
                <span className="font-bold">{h.name}</span>
                {h.data.amount && <span className="num">{fmtSol(BigInt(h.data.amount))} {h.name === "claimed" ? "" : "SOL"}</span>}
                <a className="link addr" href={explorerTx(h.signature)} target="_blank" rel="noreferrer noopener">{short(h.signature, 8)}</a>
                <span className="label">{h.blockTime ? new Date(h.blockTime * 1000).toLocaleString() : `slot ${h.slot}`}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
