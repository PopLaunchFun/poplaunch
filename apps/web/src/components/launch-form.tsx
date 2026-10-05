"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { BIN_PAGE_SIZE, PopClient, MARKET_ACCOUNT_SIZE } from "@pop/sdk";
import { FACTORY_DEFAULTS, MIN_SEED_QUOTE, SOL, BinStore, newMarketState, quantizeP0, quoteSwap, factoryMarketDefaults } from "@pop/math";
import { fmtSol, fmtPrice, priceX64ToHuman, short } from "@/lib/format";
import { explorerTx } from "@/lib/config";
import { runLaunch, LaunchError, type Stage } from "@/lib/launch-runner";
import { loadPending, type PendingLaunch } from "@/lib/launch-store";

const clean = (s: string, max: number) => s.replace(/[\u0000-\u001f\u007f<>]/g, "").slice(0, max);
const PRESETS = [1n, 5n, 20n].map((n) => n * SOL);

/** Largest single buy on a fresh market with this seed, via the exact walker (virtual pages). */
function largestFreshBuy(seedQuote: bigint): bigint {
  const cfg = factoryMarketDefaults(1_000_000_000n * 1_000_000n, seedQuote);
  const state = newMarketState(cfg);
  const store = new BinStore(cfg);
  state.status = "active";
  const p0 = quantizeP0(cfg.seedQuote, cfg.seedBase);
  let lo = cfg.minQuoteIn, hi = 100n * SOL;
  const ok = (g: bigint) => quoteSwap(cfg, state, p0, (b) => store.getVirtual(b), { direction: "buy", grossInput: g, minOutput: 0n }).ok;
  if (ok(hi)) return hi;
  while (hi - lo > 1_000_000n) { const mid = (lo + hi) / 2n; if (ok(mid)) lo = mid; else hi = mid; }
  return lo;
}

export function LaunchForm({ network, indexerOk, popMint }: { network: string; indexerOk: boolean; popMint: string | null }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [seedSol, setSeedSol] = useState("1");
  const [review, setReview] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<LaunchError | null>(null);
  const [result, setResult] = useState<{ mint: string; signatures: Record<string, string> } | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [rent, setRent] = useState<{ page: number; market: number; tokenAccount: number; mint: number } | null>(null);
  const [pending, setPending] = useState<PendingLaunch | null>(null);

  useEffect(() => {
    void Promise.all([connection.getMinimumBalanceForRentExemption(BIN_PAGE_SIZE), connection.getMinimumBalanceForRentExemption(MARKET_ACCOUNT_SIZE), connection.getMinimumBalanceForRentExemption(165), connection.getMinimumBalanceForRentExemption(82)])
      .then(([page, market, tokenAccount, mint]) => setRent({ page, market, tokenAccount, mint }))
      .catch(() => setRent(null));
  }, [connection]);

  useEffect(() => {
    if (!wallet.publicKey) return;
    const owner = wallet.publicKey;
    void connection.getBalance(owner).then(setBalance);
    setPending(loadPending(owner.toBase58()));
  }, [wallet.publicKey, connection, result]);

  const seedQuote = useMemo(() => { const n = Number(seedSol); return isFinite(n) && n > 0 ? BigInt(Math.round(n * 1e9)) : 0n; }, [seedSol]);
  const seedOk = seedQuote >= MIN_SEED_QUOTE;
  const preview = useMemo(() => {
    if (!seedOk) return null;
    const p0 = quantizeP0(seedQuote, FACTORY_DEFAULTS.seedBase);
    return { p0, maxBuy: largestFreshBuy(seedQuote) };
  }, [seedQuote, seedOk]);
  const rentTotal = rent ? rent.mint + rent.market + 4 * rent.tokenAccount + PopClient.launchPages().length * rent.page + 3 * 5000 : null;
  const total = rentTotal === null ? null : Number(seedQuote) + rentTotal;
  const insufficient = balance !== null && total !== null && balance < total + 0.01 * LAMPORTS_PER_SOL;
  const validName = name.trim().length >= 1 && name.length <= 32;
  const validSymbol = /^[A-Z0-9]{1,10}$/.test(symbol);
  const validUrl = (s: string) => !s || /^https:\/\/\S+$/.test(s);
  const valid = validName && validSymbol && seedOk && validUrl(imageUrl) && validUrl(website) && description.length <= 500;

  async function go(resume?: PendingLaunch | null) {
    if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) return;
    setError(null);
    setResult(null);
    try {
      const r = await runLaunch(
        connection,
        { publicKey: wallet.publicKey, signTransaction: wallet.signTransaction, signAllTransactions: wallet.signAllTransactions, signMessage: wallet.signMessage },
        { name: resume?.name ?? name.trim(), symbol: resume?.symbol ?? symbol, seedQuote: resume ? BigInt(resume.seedQuote) : seedQuote, metadata: resume?.metadata ?? { imageUrl, description, website, twitter, telegram } },
        (s, d) => { setStage(s); setDetail(d); },
        resume,
      );
      setResult({ mint: r.mint.toBase58(), signatures: r.signatures });
      setPending(null);
    } catch (e) {
      setError(e instanceof LaunchError ? e : new LaunchError("failed", (e as Error).message));
      setStage("idle");
      if (wallet.publicKey) setPending(loadPending(wallet.publicKey.toBase58()));
    }
  }

  if (result) {
    return (
      <div className="panel p-6 mt-6 max-w-xl">
        <div className="text-xl font-bold text-green">Your coin is live.</div>
        <div className="num text-xs text-muted mt-2 break-all">mint {result.mint}</div>
        <div className="flex gap-2 mt-4">
          <Link href={`/coin/${result.mint}`} className="btn btn-green">Trade</Link>
          <button className="btn" onClick={() => void navigator.clipboard.writeText(`${location.origin}/coin/${result.mint}`)}>Copy link</button>
        </div>
        <ul className="text-xs text-muted mt-4 space-y-1">
          {Object.entries(result.signatures).map(([k, s]) => <li key={k}>{k}: <a className="link num" href={explorerTx(s)} target="_blank" rel="noreferrer">{short(s, 8)}</a></li>)}
        </ul>
        {!indexerOk && <p className="text-xs text-neg mt-3">The indexer is offline, so the directory may lag; the coin page reads the chain directly.</p>}
      </div>
    );
  }

  return (
    <div className="mt-6 grid lg:grid-cols-[1fr_360px] gap-6">
      <div>
        {pending && stage === "idle" && (
          <div className="panel p-4 mb-4 text-sm border-green/50">
            <div className="font-semibold">Unfinished launch found: {pending.name} ({pending.symbol})</div>
            <div className="text-muted text-xs mt-1">Stopped at step “{pending.step}”. Resuming checks the chain first and never creates a second mint.</div>
            <div className="flex gap-2 mt-3"><button className="btn btn-green btn-sm" onClick={() => void go(pending)}>Resume launch</button><Link href="/my-launches" className="btn btn-sm">My launches</Link></div>
          </div>
        )}
        {!review ? (
          <div className="grid md:grid-cols-2 gap-3">
            <label className="block md:col-span-2"><span className="label">Name</span><input className="input mt-1" value={name} onChange={(e) => setName(clean(e.target.value, 32))} placeholder="My Coin" maxLength={32} /></label>
            <label className="block"><span className="label">Ticker</span><input className="input mt-1" value={symbol} onChange={(e) => setSymbol(clean(e.target.value.toUpperCase(), 10).replace(/[^A-Z0-9]/g, ""))} placeholder="COIN" maxLength={10} /></label>
            <label className="block"><span className="label">Image URL (https)</span><input className="input mt-1" value={imageUrl} onChange={(e) => setImageUrl(clean(e.target.value, 512))} placeholder="https://…/image.png" /></label>
            <label className="block md:col-span-2"><span className="label">Description (≤500)</span><textarea className="input mt-1 font-sans" rows={3} value={description} onChange={(e) => setDescription(clean(e.target.value, 500))} /></label>
            <label className="block"><span className="label">Website (optional)</span><input className="input mt-1" value={website} onChange={(e) => setWebsite(clean(e.target.value, 200))} placeholder="https://" /></label>
            <label className="block"><span className="label">X / Telegram (optional)</span><div className="flex gap-2 mt-1"><input className="input" value={twitter} onChange={(e) => setTwitter(clean(e.target.value, 64))} placeholder="@handle" /><input className="input" value={telegram} onChange={(e) => setTelegram(clean(e.target.value, 64))} placeholder="t.me handle" /></div></label>
            <div className="md:col-span-2">
              <span className="label">Seed SOL locked into the market (minimum {fmtSol(MIN_SEED_QUOTE, 0)})</span>
              <div className="flex flex-wrap gap-2 mt-1 items-center">
                {PRESETS.map((p) => <button key={p.toString()} className={`chip ${seedQuote === p ? "chip-on" : ""}`} onClick={() => setSeedSol((Number(p) / 1e9).toString())}>{Number(p) / 1e9} SOL</button>)}
                <input className="input w-28 py-1" inputMode="decimal" value={seedSol} onChange={(e) => setSeedSol(e.target.value.replace(/[^0-9.]/g, ""))} aria-label="custom seed SOL" />
              </div>
              {!seedOk && <div className="text-xs text-neg mt-1">Seed must be at least {fmtSol(MIN_SEED_QUOTE, 0)}.</div>}
            </div>
            <p className="text-xs text-muted md:col-span-2">Host the image anywhere durable (https, ≤1 MB recommended). Name and ticker are stored on-chain and cannot change; image, description and links are stored off-chain under your signature and can be edited later from My launches.</p>
            <button className="btn btn-green md:col-span-2" disabled={!valid} onClick={() => setReview(true)}>Review launch</button>
          </div>
        ) : (
          <div className="panel p-4 text-sm">
            <div className="label mb-2">Review</div>
            <table className="w-full"><tbody>
              {[
                ["Name / ticker", `${name} · ${symbol}`],
                ["Supply", "1,000,000,000 (6 decimals), 100% to seed inventory"],
                ["Creator allocation", "none"],
                ["Creator fee address", wallet.publicKey ? short(wallet.publicKey.toBase58(), 6) : "connect wallet"],
                ["Trading fee", "2.00% of input: 1.50% scar escrow, 0.25% protocol, 0.25% creator (you)"],
                ["Buyback earmark", "50% of the protocol's SOL fee from this coin goes to the POP buyback escrow"],
                ["Mint authority", "revoked at creation; no freeze authority"],
                ["Seed locked", fmtSol(seedQuote)],
                ["Rent (mint, market, 4 vaults, 4 price pages)", rentTotal === null ? "…" : fmtSol(rentTotal)],
                ["Creation fee", "none"],
                ["Total", total === null ? "…" : fmtSol(total)],
                ["Signatures", "3 transactions + 1 message (metadata)"],
              ].map(([k, v]) => <tr key={k} className="border-t border-line"><td className="py-1.5 text-muted pr-3 w-56">{k}</td><td className="py-1.5 num">{v}</td></tr>)}
            </tbody></table>
            {preview && <p className="text-xs text-muted mt-3">P0 = {fmtPrice(priceX64ToHuman(preview.p0, 6))} SOL per token. Largest single buy on the fresh market: <span className="num text-text">{fmtSol(preview.maxBuy)}</span> (32-bin limit); bigger orders split into several transactions. Experimental calibration, not a valuation.</p>}
            {insufficient && <div className="text-xs text-neg mt-2">Wallet balance {balance !== null ? fmtSol(balance) : "–"} is below the total plus fees.</div>}
            {error && <div className="text-xs text-neg mt-2 break-all">{error.message}</div>}
            {stage !== "idle" && <div className="text-xs text-green mt-2">{detail}</div>}
            <div className="flex gap-2 mt-4">
              <button className="btn" disabled={stage !== "idle"} onClick={() => setReview(false)}>Back</button>
              <button className="btn btn-green" disabled={!wallet.connected || stage !== "idle" || insufficient} onClick={() => void go(null)}>{!wallet.connected ? "Connect wallet to launch" : stage === "idle" ? `Launch coin on ${network}` : "Working…"}</button>
            </div>
          </div>
        )}
      </div>
      <aside className="space-y-3">
        <div className="panel p-4 text-sm">
          <div className="label">Cost summary</div>
          <ul className="mt-2 space-y-1">
            <li className="flex justify-between"><span className="text-muted">Seed locked forever</span><span className="num">{seedOk ? fmtSol(seedQuote) : "–"}</span></li>
            <li className="flex justify-between"><span className="text-muted">Rent (non-refundable)</span><span className="num">{rentTotal === null ? "…" : fmtSol(rentTotal)}</span></li>
            <li className="flex justify-between"><span className="text-muted">Creation fee</span><span className="num">none</span></li>
            <li className="flex justify-between border-t border-line pt-1 mt-1"><span>Total</span><span className="num">{total === null ? "…" : fmtSol(total)}</span></li>
            <li className="flex justify-between"><span className="text-muted">Wallet balance</span><span className="num">{balance === null ? "connect" : fmtSol(balance)}</span></li>
          </ul>
          <p className="text-xs text-muted mt-3">Further price pages are created lazily by whoever trades into them (≈{rent ? fmtSol(rent.page) : "0.01 SOL"} each).</p>
        </div>
        <div className="panel p-4 text-xs text-muted">
          <div className="label mb-1">What a launch is</div>
          Every trade pays 2% fees; buy fees and sell fees pair at the price bins they crossed and become locked liquidity. Reserves move with trading; there is no floor and no guaranteed exit. Graduation is a fee-history milestone. {popMint ? "" : "The POP buyback mint is not published yet; earmarked SOL accrues in escrow meanwhile."} <Link className="link" href="/mechanism">How it works</Link>.
        </div>
      </aside>
    </div>
  );
}
