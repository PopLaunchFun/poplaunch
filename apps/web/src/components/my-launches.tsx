"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider } from "@anchor-lang/core";
import { PublicKey, Transaction } from "@solana/web3.js";
import { NATIVE_MINT, createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PopClient, marketPda } from "@pop/sdk";
import { api, type MarketSummary } from "@/lib/api";
import { fmtSol, fmtBase, short, fmtPct } from "@/lib/format";
import { explorerTx } from "@/lib/config";
import { loadPending, type PendingLaunch } from "@/lib/launch-store";
import { runLaunch, signAndPostMetadata, type Stage } from "@/lib/launch-runner";
import { CoinImage, ProgressBar, Skeleton, StatusTag } from "./ui";

interface Row { mint: string; market: string; name: string; symbol: string; status: string; missingPages: number[]; creatorQuote: bigint; creatorBase: bigint; decimals: number; summary?: MarketSummary }

export function MyLaunches() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pending, setPending] = useState<PendingLaunch | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ mint: string; imageUrl: string; description: string; website: string; twitter: string; telegram: string } | null>(null);

  const load = useCallback(async () => {
    if (!wallet.publicKey) return;
    const owner = wallet.publicKey;
    setPending(loadPending(owner.toBase58()));
    const client = PopClient.readOnly(connection);
    // Chain is the source of truth; the indexer adds metadata/snapshots when available.
    const onchain = await client.fetchMarketsByCreator(owner).catch(() => []);
    const indexed = (await api.creatorMarkets(owner.toBase58()))?.markets ?? [];
    const out: Row[] = [];
    for (const m of onchain) {
      const v = await client.fetchMarket(m.publicKey);
      const s = indexed.find((x) => x.address === m.publicKey.toBase58());
      out.push({ mint: m.account.baseMint.toBase58(), market: m.publicKey.toBase58(), name: m.account.name, symbol: m.account.symbol, status: v.state.status, missingPages: v.missingPages, creatorQuote: v.state.creatorClaimableQuote, creatorBase: v.state.creatorClaimableBase, decimals: v.config.baseDecimals, summary: s });
    }
    setRows(out);
  }, [wallet.publicKey, connection]);

  useEffect(() => { void load(); }, [load]);

  const w = () => ({ publicKey: wallet.publicKey!, signTransaction: wallet.signTransaction!, signAllTransactions: wallet.signAllTransactions!, signMessage: wallet.signMessage });
  const provider = () => new AnchorProvider(connection, wallet as never, { commitment: "confirmed" });

  async function claim(r: Row, asset: "base" | "quote") {
    setBusy(`${r.mint}:${asset}`); setMsg(null);
    try {
      const client = new PopClient(provider());
      const mint = asset === "base" ? new PublicKey(r.mint) : NATIVE_MINT;
      const ata = getAssociatedTokenAddressSync(mint, wallet.publicKey!);
      const tx = new Transaction().add(createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey!, ata, wallet.publicKey!, mint), await client.claimFeesIx(new PublicKey(r.market), 1, asset, wallet.publicKey!, new PublicKey(r.mint)));
      const sig = await provider().sendAndConfirm(tx);
      setMsg(`Claimed ${asset} fees: ${sig}`);
      await load();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  }

  async function createPages(r: Row) {
    setBusy(`${r.mint}:pages`); setMsg(null);
    try {
      const client = new PopClient(provider());
      const v = await client.fetchMarket(new PublicKey(r.market));
      const ixs = await client.initializePagesIxs(wallet.publicKey!, v.address, v.config, v.missingPages);
      for (let i = 0; i < ixs.length; i += 6) await provider().sendAndConfirm(new Transaction().add(...ixs.slice(i, i + 6)));
      setMsg(`Created ${ixs.length} pages`);
      await load();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  }

  async function resume(r: Row | null) {
    setBusy("resume"); setMsg(null);
    try {
      const { savePending } = await import("@/lib/launch-store");
      const ro = PopClient.readOnly(connection);
      let rec: PendingLaunch;
      if (pending && (!r || pending.mintPubkey === r.mint)) {
        rec = pending;
      } else if (r) {
        rec = { mintPubkey: r.mint, name: r.name, symbol: r.symbol, uri: "", seedQuote: "0", metadata: {}, step: "pages", signatures: {}, updatedAt: Date.now() };
      } else {
        throw new Error("nothing to resume");
      }
      // Seed amount is authoritative on-chain once the market exists.
      try {
        const raw = await ro.fetchMarketRaw(marketPda(ro.programId, new PublicKey(rec.mintPubkey)));
        rec = { ...rec, seedQuote: raw.seedQuoteTotal.toString() };
      } catch {
        /* market not created yet: keep the stored seed */
      }
      savePending(wallet.publicKey!.toBase58(), rec);
      await runLaunch(connection, w(), { name: rec.name, symbol: rec.symbol, seedQuote: BigInt(rec.seedQuote), metadata: rec.metadata }, (s: Stage, d) => setMsg(`${s}: ${d}`), rec);
      await load();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  }

  async function saveMetadata() {
    if (!editing) return;
    setBusy("meta"); setMsg(null);
    try {
      await signAndPostMetadata(w(), editing.mint, editing);
      setMsg("Metadata saved.");
      setEditing(null);
      await load();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  }

  if (!wallet.connected) {
    return (
      <div className="panel p-6 mt-6">
        <div className="font-semibold">Wallet not connected</div>
        <p className="text-[14px] text-muted mt-1">Connect a wallet to see the coins it created. Nothing is listed until then.</p>
      </div>
    );
  }
  if (rows === null) {
    return (
      <div className="mt-4" aria-busy="true" aria-label="Loading your launches">
        {[0, 1].map((i) => (
          <div key={i} className="border-b border-line py-4 flex items-center gap-3"><Skeleton className="w-11 h-11 rounded-lg" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-24" /></div><Skeleton className="h-8 w-24" /></div>
        ))}
      </div>
    );
  }
  const orphanPending = pending && !rows.some((r) => r.mint === pending.mintPubkey);
  const sigIn = (m: string) => m.match(/[1-9A-HJ-NP-Za-km-z]{60,}/)?.[0] ?? null;
  return (
    <div className="mt-4">
      {msg && (
        <div className="panel p-3 mb-3 text-[12px] break-all" role="status" aria-live="polite">
          {sigIn(msg) ? <>{msg.slice(0, msg.indexOf(sigIn(msg)!))}<a className="link addr" href={explorerTx(sigIn(msg)!)} target="_blank" rel="noreferrer">{short(sigIn(msg)!, 8)}</a></> : msg}
        </div>
      )}
      {orphanPending && (
        <div className="panel p-4 mb-3">
          <div className="font-semibold">Unfinished launch: {pending!.name} ({pending!.symbol})</div>
          <div className="label mt-1">Not found on-chain yet (creation was never confirmed). Resume will send it.</div>
          <button className="btn btn-green btn-sm mt-3" disabled={!!busy} onClick={() => void resume(null)}>Resume</button>
        </div>
      )}
      {rows.length === 0 && !orphanPending && (
        <div className="panel p-8 text-center">
          <div className="text-[16px] font-semibold">No coins yet</div>
          <p className="text-[14px] text-muted mt-1">This wallet has not launched a coin on this network.</p>
          <Link className="btn btn-green mt-4" href="/launch">Launch coin</Link>
        </div>
      )}
      <ul className="-mx-4 md:mx-0">
        {rows.map((r) => {
          const progress = r.summary?.maturity.progress ?? null;
          const isEditing = editing?.mint === r.mint;
          return (
            <li key={r.mint} className="border-b border-line px-4 md:px-0 py-4">
              <div className="flex items-center gap-3">
                <CoinImage url={r.summary?.metadata?.imageUrl} symbol={r.symbol} size={44} name={r.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[16px] font-semibold truncate">{r.name}</span>
                    {r.status === "created" ? <span className="tag tag-violet">Not activated</span> : <StatusTag status={r.status} compact />}
                  </div>
                  <div className="label truncate">{r.symbol} · mint <span className="addr">{short(r.mint, 6)}</span>{r.missingPages.length > 0 && ` · ${36 - r.missingPages.length}/36 price pages`}</div>
                </div>
                <div className="shrink-0 flex gap-2">
                  {r.status === "created" ? (
                    <button className="btn btn-green btn-sm" disabled={!!busy} onClick={() => void resume(r)}>Resume launch</button>
                  ) : (
                    <Link href={`/coin/${r.mint}`} className="btn btn-sm">Open</Link>
                  )}
                </div>
              </div>
              {progress !== null && (
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex-1"><ProgressBar value={progress} label={`Pain proven ${fmtPct(progress, 0)}`} /></div>
                  <span className="label num shrink-0">Pain proven <span className="text-text">{fmtPct(progress, 0)}</span></span>
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-[14px]">
                <div className="flex items-center gap-2">
                  <span className="label">Creator fees</span>
                  <span className="num">{fmtSol(r.creatorQuote)}</span>
                  <button className="btn btn-sm" disabled={r.creatorQuote === 0n || !!busy} onClick={() => void claim(r, "quote")}>Claim SOL</button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="num">{fmtBase(r.creatorBase, r.decimals, r.symbol)}</span>
                  <button className="btn btn-sm" disabled={r.creatorBase === 0n || !!busy} onClick={() => void claim(r, "base")}>Claim {r.symbol}</button>
                </div>
                {r.missingPages.length > 0 && r.status !== "created" && <button className="btn btn-sm" disabled={!!busy} onClick={() => void createPages(r)}>Create remaining pages ({r.missingPages.length})</button>}
                {!isEditing && <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ mint: r.mint, imageUrl: r.summary?.metadata?.imageUrl ?? "", description: r.summary?.metadata?.description ?? "", website: r.summary?.metadata?.website ?? "", twitter: r.summary?.metadata?.twitter ?? "", telegram: r.summary?.metadata?.telegram ?? "" })}>Edit details</button>}
              </div>
              {isEditing && (
                <div className="mt-3 panel p-3 grid sm:grid-cols-2 gap-2">
                  <input className="input" placeholder="https image URL" value={editing.imageUrl} onChange={(e) => setEditing({ ...editing, imageUrl: e.target.value })} aria-label="Image URL" />
                  <input className="input" placeholder="Website (https)" value={editing.website} onChange={(e) => setEditing({ ...editing, website: e.target.value })} aria-label="Website" />
                  <input className="input" placeholder="@x handle" value={editing.twitter} onChange={(e) => setEditing({ ...editing, twitter: e.target.value })} aria-label="X handle" />
                  <input className="input" placeholder="Telegram handle" value={editing.telegram} onChange={(e) => setEditing({ ...editing, telegram: e.target.value })} aria-label="Telegram handle" />
                  <textarea className="input sm:col-span-2" rows={2} placeholder="Description" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value.slice(0, 500) })} aria-label="Description" />
                  <div className="flex gap-2 sm:col-span-2"><button className="btn btn-green btn-sm" disabled={!!busy} onClick={() => void saveMetadata()}>Sign and save</button><button className="btn btn-sm" onClick={() => setEditing(null)}>Cancel</button><span className="label self-center">Signed message, no transaction.</span></div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="label mt-3">Claims move only your creator fee balances. Seed and scar inventory are not withdrawable by anyone.</p>
    </div>
  );
}
