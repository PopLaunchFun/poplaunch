"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider } from "@anchor-lang/core";
import { PublicKey, Transaction } from "@solana/web3.js";
import { NATIVE_MINT, createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PopClient, marketPda } from "@pop/sdk";
import { api, type MarketSummary } from "@/lib/api";
import { fmtSol, fmtBase, short } from "@/lib/format";
import { explorerTx } from "@/lib/config";
import { loadPending, type PendingLaunch } from "@/lib/launch-store";
import { runLaunch, signAndPostMetadata, type Stage } from "@/lib/launch-runner";
import { CoinImage, StatusTag } from "./ui";

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

  if (!wallet.connected) return <div className="panel p-6 mt-6 text-sm text-muted">Connect a wallet to see your launches.</div>;
  if (rows === null) return <div className="panel p-6 mt-6 text-sm text-muted">Loading from chain…</div>;
  const orphanPending = pending && !rows.some((r) => r.mint === pending.mintPubkey);
  return (
    <div className="mt-5 space-y-3">
      {msg && <div className="text-xs break-all panel p-2">{msg.includes(":") && msg.length > 60 && /[1-9A-HJ-NP-Za-km-z]{60,}/.test(msg) ? <>{msg.split(":")[0]}: <a className="link num" href={explorerTx(msg.split(": ").pop()!)} target="_blank" rel="noreferrer">{short(msg.split(": ").pop()!, 8)}</a></> : msg}</div>}
      {orphanPending && (
        <div className="panel p-4 text-sm border-green/50">
          <div className="font-semibold">Unfinished launch: {pending!.name} ({pending!.symbol})</div>
          <div className="text-xs text-muted">Not found on-chain yet (creation was never confirmed). Resume will send it.</div>
          <button className="btn btn-green btn-sm mt-2" disabled={!!busy} onClick={() => void resume(null)}>Resume</button>
        </div>
      )}
      {rows.length === 0 && !orphanPending && <div className="panel p-6 text-sm text-muted">No coins yet. <Link className="link" href="/launch">Launch one</Link>.</div>}
      {rows.map((r) => {
        return (
          <div key={r.mint} className="panel p-4 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <CoinImage url={r.summary?.metadata?.imageUrl} symbol={r.symbol} />
              <div className="min-w-0"><div className="font-semibold">{r.name} <span className="text-muted">· {r.symbol}</span></div><div className="num text-xs text-muted break-all">mint {short(r.mint, 8)}</div></div>
              <StatusTag status={r.status} />
              <div className="ml-auto flex gap-2">
                {r.status === "created" && <button className="btn btn-green btn-sm" disabled={!!busy} onClick={() => void resume(r)}>Resume launch</button>}
                {r.status !== "created" && <Link href={`/coin/${r.mint}`} className="btn btn-sm">Open market</Link>}
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-3 mt-3 text-xs">
              <div className="raised rounded-lg p-2"><div className="label">Creator fees (SOL)</div><div className="num text-base">{fmtSol(r.creatorQuote)}</div><button className="btn btn-sm mt-1" disabled={r.creatorQuote === 0n || !!busy} onClick={() => void claim(r, "quote")}>Claim</button></div>
              <div className="raised rounded-lg p-2"><div className="label">Creator fees ({r.symbol})</div><div className="num text-base">{fmtBase(r.creatorBase, r.decimals)}</div><button className="btn btn-sm mt-1" disabled={r.creatorBase === 0n || !!busy} onClick={() => void claim(r, "base")}>Claim</button></div>
              <div className="raised rounded-lg p-2"><div className="label">Price pages</div><div className="num text-base">{36 - r.missingPages.length} / 36</div>{r.missingPages.length > 0 && <button className="btn btn-sm mt-1" disabled={!!busy} onClick={() => void createPages(r)}>Create remaining ({r.missingPages.length})</button>}</div>
            </div>
            <div className="mt-3">
              {editing?.mint === r.mint ? (
                <div className="grid sm:grid-cols-2 gap-2">
                  <input className="input" placeholder="https image URL" value={editing.imageUrl} onChange={(e) => setEditing({ ...editing, imageUrl: e.target.value })} />
                  <input className="input" placeholder="website https" value={editing.website} onChange={(e) => setEditing({ ...editing, website: e.target.value })} />
                  <input className="input" placeholder="@x handle" value={editing.twitter} onChange={(e) => setEditing({ ...editing, twitter: e.target.value })} />
                  <input className="input" placeholder="telegram handle" value={editing.telegram} onChange={(e) => setEditing({ ...editing, telegram: e.target.value })} />
                  <textarea className="input sm:col-span-2 font-sans" rows={2} placeholder="description" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value.slice(0, 500) })} />
                  <div className="flex gap-2"><button className="btn btn-green btn-sm" disabled={!!busy} onClick={() => void saveMetadata()}>Sign and save</button><button className="btn btn-sm" onClick={() => setEditing(null)}>Cancel</button></div>
                </div>
              ) : (
                <button className="link text-xs" onClick={() => setEditing({ mint: r.mint, imageUrl: r.summary?.metadata?.imageUrl ?? "", description: r.summary?.metadata?.description ?? "", website: r.summary?.metadata?.website ?? "", twitter: r.summary?.metadata?.twitter ?? "", telegram: r.summary?.metadata?.telegram ?? "" })}>Edit image, description and links (signed message, no transaction)</button>
              )}
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted">Claims can only move your creator fee balances. Seed and scar inventory are not withdrawable by anyone.</p>
    </div>
  );
}
