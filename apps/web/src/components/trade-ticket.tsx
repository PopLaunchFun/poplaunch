"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import { AnchorProvider } from "@anchor-lang/core";
import { PopClient, type MarketView } from "@pop/sdk";
import type { SwapOutcome } from "@pop/math";
import type { MarketSummary } from "@/lib/api";
import { NETWORK, explorerTx } from "@/lib/config";
import { readClient, connection as rpc } from "@/lib/chain";
import { fmtSol, fmtBase, fmtPrice, priceX64ToHuman, fmtUsd } from "@/lib/format";
import { useSolUsd } from "@/lib/usd";

type Stage = "idle" | "quoting" | "simulating" | "signing" | "confirming";

/** Lifted to the page after a confirmed swap: touched bins and REAL ScarFormed events for that signature. */
export interface ConfirmedSwap {
  signature: string;
  touched: [number, number];
  scarsFormed: { bin: number; base: bigint; quote: bigint }[];
  isBuy: boolean;
}

export function TradeTicket({ summary, onClose, onConfirmed }: { summary: MarketSummary; onClose?: () => void; onConfirmed?: (c: ConfirmedSwap) => void }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const solUsd = useSolUsd();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("0.05");
  const [slippageBps, setSlippageBps] = useState(100);
  const [view, setView] = useState<MarketView | null>(null);
  const [viewSlot, setViewSlot] = useState<number>(0);
  const [quote, setQuote] = useState<SwapOutcome | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [balances, setBalances] = useState<{ sol: bigint; base: bigint } | null>(null);
  const [walletNet, setWalletNet] = useState<string | null>(null);
  const [pageRent, setPageRent] = useState<number>(0);
  const [advanced, setAdvanced] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const market = new PublicKey(summary.address);
  const dec = summary.baseDecimals;

  const refresh = useCallback(async () => {
    try {
      const c = readClient();
      const v = await c.fetchMarket(market);
      setView(v);
      setViewSlot(await rpc().getSlot("confirmed"));
      if (!pageRent) setPageRent(await c.pageRentLamports());
      setError((e) => (e?.startsWith("RPC unavailable") ? null : e));
    } catch (e) {
      setError(`RPC unavailable: ${(e as Error).message}`);
    }
  }, [summary.address]);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 6000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!wallet.publicKey) {
      setBalances(null);
      return;
    }
    const owner = wallet.publicKey;
    const load = async () => {
      const sol = BigInt(await connection.getBalance(owner));
      let base = 0n;
      try {
        base = (await getAccount(connection, getAssociatedTokenAddressSync(new PublicKey(summary.baseMint), owner))).amount;
      } catch {
        base = 0n;
      }
      setBalances({ sol, base });
      try {
        const hash = await connection.getGenesisHash();
        setWalletNet(hash === "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d" ? "mainnet-beta" : hash === "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG" ? "devnet" : "localnet");
      } catch {
        setWalletNet(null);
      }
    };
    void load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [wallet.publicKey, connection, summary.baseMint, sig]);

  const gross = (() => {
    const n = Number(amount);
    if (!isFinite(n) || n <= 0) return 0n;
    return side === "buy" ? BigInt(Math.round(n * 1e9)) : BigInt(Math.round(n * 10 ** dec));
  })();

  useEffect(() => {
    if (!view || gross === 0n) {
      setQuote(null);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setQuote(readClient().quote(view, side, gross)), 120);
  }, [view, side, gross]);

  const q = quote;
  const route = q?.ok && view ? readClient().routePages(view, q) : null;
  const pagesToCreate = route?.toCreate.length ?? 0;
  const rentNeeded = BigInt(pagesToCreate * pageRent);
  const minOutput = q?.ok ? (q.output * BigInt(10_000 - slippageBps)) / 10_000n : 0n;
  const networkMismatch = walletNet && NETWORK !== walletNet && !(NETWORK === "localnet" && walletNet === "localnet");
  const insufficient = balances && gross > 0n && (side === "buy" ? balances.sol < gross + rentNeeded + 10_000_000n : balances.base < gross || balances.sol < rentNeeded + 5_000_000n);

  async function submit() {
    if (!wallet.publicKey || !wallet.signTransaction || !view || !q?.ok) return;
    setError(null);
    setSig(null);
    try {
      setStage("quoting");
      const fresh = await readClient().fetchMarket(market);
      const fq = readClient().quote(fresh, side, gross);
      if (!fq.ok) throw new Error(`State changed: ${fq.error}. ${fq.detail}`);
      if (fq.output < minOutput) throw new Error(`State changed: the quote is now ${fq.output} < your minimum ${minOutput}. Re-quote before sending.`);
      const slot = await connection.getSlot("confirmed");
      const provider = new AnchorProvider(connection, wallet as never, { commitment: "confirmed" });
      const client = new PopClient(provider);
      const tx = await client.buildSwapTransaction(wallet.publicKey, fresh, fq, { isBuy: side === "buy", grossInput: gross, minOutput, deadlineSlot: BigInt(slot + 150), unwrap: side === "sell" });
      tx.feePayer = wallet.publicKey;
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      setStage("simulating");
      const sim = await connection.simulateTransaction(tx);
      if (sim.value.err) {
        const logs = (sim.value.logs ?? []).filter((l) => l.includes("Error") || l.includes("failed")).join("\n");
        throw new Error(`Simulation failed: ${JSON.stringify(sim.value.err)}\n${logs}`);
      }
      setStage("signing");
      const signed = await wallet.signTransaction(tx);
      setStage("confirming");
      const s = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
      const conf = await connection.confirmTransaction({ signature: s, blockhash, lastValidBlockHeight }, "confirmed");
      if (conf.value.err) throw new Error(`Transaction failed on chain: ${JSON.stringify(conf.value.err)}`);
      setSig(s);
      // Real events only: the pulse and "Scar formed" come from ScarFormed events in this signature.
      const events = await client.eventsForSignature(s);
      const swapEv = events.find((e) => e.name === "swapExecuted");
      const scarsFormed = events.filter((e) => e.name === "scarFormed").map((e) => ({ bin: Number(e.data.binId), base: BigInt(e.data.base.toString()), quote: BigInt(e.data.quote.toString()) }));
      const touched: [number, number] = swapEv ? [Number(swapEv.data.startBin), Number(swapEv.data.endBin)] : [fq.fills[0]!.bin, fq.newCursor];
      onConfirmed?.({ signature: s, touched, scarsFormed, isBuy: side === "buy" });
      await refresh();
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      setError(/User rejected|rejected the request/i.test(msg) ? "Rejected in wallet. Nothing was sent." : /block height exceeded|expired|Blockhash not found/i.test(msg) ? "Blockhash expired before confirmation. Nothing was executed; re-quote and try again." : msg);
    } finally {
      setStage("idle");
    }
  }

  const impact = q?.ok ? priceX64ToHuman(q.endPriceX64, dec) / priceX64ToHuman(q.startPriceX64, dec) - 1 : null;
  const avg = q?.ok && q.avgPriceX64 ? priceX64ToHuman(q.avgPriceX64, dec) : null;
  const errorText = q && !q.ok
    ? q.error === "TraversalLimit" ? `Not enough depth within 32 price bins for this size. Split into smaller trades (each needs its own quote and signature).`
    : q.error === "BuyInventoryExhausted" || q.error === "SellInventoryExhausted" ? `Reserves depleted: ${q.detail}`
    : q.error === "InputBelowMinimum" ? `Below the minimum trade size.`
    : `${q.error}: ${q.detail}`
    : null;

  const rejected = !!error && /^Rejected in wallet/.test(error);
  const status: { tone: "muted" | "green" | "neg"; text: string } | null =
    stage === "quoting" || stage === "simulating" ? { tone: "muted", text: stage === "quoting" ? "Re-quoting from live state…" : "Simulating before you sign…" }
    : stage === "signing" ? { tone: "muted", text: "Waiting for your signature in the wallet." }
    : stage === "confirming" ? { tone: "muted", text: "Pending: sent to the network, waiting for confirmation…" }
    : sig ? { tone: "green", text: "Confirmed on chain." }
    : error ? { tone: "neg", text: rejected ? "Rejected in the wallet. Nothing was sent." : "Failed. Nothing was executed." }
    : null;

  return (
    <div className="panel p-4 text-[14px]">
      <div className="flex justify-between items-center">
        <div className="flex gap-1 raised rounded-lg p-1" role="tablist" aria-label="Side">
          <button role="tab" aria-selected={side === "buy"} className={`h-8 px-4 rounded-md font-semibold ${side === "buy" ? "bg-green text-green-ink" : "text-muted"}`} onClick={() => setSide("buy")}>Buy</button>
          <button role="tab" aria-selected={side === "sell"} className={`h-8 px-4 rounded-md font-semibold ${side === "sell" ? "bg-neg text-[#1a0d10]" : "text-muted"}`} onClick={() => setSide("sell")}>Sell</button>
        </div>
        {onClose && <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close trade ticket">Close</button>}
      </div>
      <label className="block mt-4">
        <span className="label">{side === "buy" ? "Pay (SOL)" : `Sell (${summary.symbol})`}</span>
        <input className="input input-lg mt-1 text-[18px] num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} aria-label="amount" />
      </label>
      <div className="flex justify-between label mt-1 num">
        <span>Balance: {balances ? (side === "buy" ? fmtSol(balances.sol) : fmtBase(balances.base, dec, summary.symbol)) : "wallet not connected"}</span>
        {balances && <button className="link" onClick={() => setAmount(side === "buy" ? Math.max(0, Number(balances.sol) / 1e9 - 0.03).toFixed(4) : (Number(balances.base) / 10 ** dec).toString())}>Max</button>}
      </div>

      <div className="mt-4 space-y-1 num text-[12px] min-h-[64px]">
        {!view && !error && <div className="text-muted">Loading live market state…</div>}
        {errorText && <div className="text-neg">{errorText}</div>}
        {q?.ok && (
          <>
            <Row k="You receive" v={side === "buy" ? fmtBase(q.output, dec, summary.symbol) : fmtSol(q.output)} strong />
            <Row k="Minimum after slippage" v={side === "buy" ? fmtBase(minOutput, dec, summary.symbol) : fmtSol(minOutput)} />
            <Row k="Avg price" v={avg ? `${fmtPrice(avg)} SOL` : "—"} />
            <Row k="Price impact" v={impact !== null ? `${(impact * 100).toFixed(2)}% · ${q.binsInspected} bins` : "—"} tone={impact !== null && Math.abs(impact) > 0.1 ? "neg" : undefined} />
            <Row k="Fees 2.00%" v={side === "buy" ? fmtSol(q.fees.scarFee + q.fees.protocolFee + q.fees.creatorFee) : fmtBase(q.fees.scarFee + q.fees.protocolFee + q.fees.creatorFee, dec, summary.symbol)} />
            {pagesToCreate > 0 && <Row k={`Creates ${pagesToCreate} price page${pagesToCreate > 1 ? "s" : ""} (rent)`} v={`+ ${fmtSol(rentNeeded)}`} tone="violet" />}
            <Row k="Network fee" v="≈ 0.000005 SOL" />
            {side === "buy" && solUsd !== null && <Row k="USD (indicative)" v={fmtUsd((Number(gross) / 1e9) * solUsd)} />}
            <button className="link text-muted" onClick={() => setAdvanced((a) => !a)} aria-expanded={advanced}>{advanced ? "Hide" : "Show"} fee breakdown</button>
            {advanced && (
              <>
                <Row k="Scar escrow 1.50%" v={side === "buy" ? fmtSol(q.fees.scarFee) : fmtBase(q.fees.scarFee, dec, summary.symbol)} tone="green" />
                <Row k="Protocol 0.25%" v={side === "buy" ? fmtSol(q.fees.protocolFee) : fmtBase(q.fees.protocolFee, dec, summary.symbol)} />
                <Row k="Creator 0.25%" v={side === "buy" ? fmtSol(q.fees.creatorFee) : fmtBase(q.fees.creatorFee, dec, summary.symbol)} />
                <Row k="Net traded" v={side === "buy" ? fmtSol(q.fees.tradable) : fmtBase(q.fees.tradable, dec, summary.symbol)} />
                <Row k="Route" v={`bins ${q.fills[0]!.bin} to ${q.newCursor}`} />
              </>
            )}
          </>
        )}
      </div>

      <div className="mt-3 flex items-center gap-1.5 flex-wrap" role="group" aria-label="Slippage tolerance">
        <span className="label mr-1">Slippage</span>
        {[50, 100, 300].map((b) => (
          <button key={b} className={`h-8 px-2.5 rounded-md text-[12px] num border ${slippageBps === b ? "border-line bg-raised text-text" : "border-transparent text-muted hover:text-text"}`} aria-pressed={slippageBps === b} onClick={() => setSlippageBps(b)}>{b / 100}%</button>
        ))}
        <input className="input w-16 h-8 text-[12px] num" value={slippageBps / 100} onChange={(e) => { const v = Number(e.target.value); if (isFinite(v) && v >= 0 && v <= 50) setSlippageBps(Math.round(v * 100)); }} aria-label="custom slippage percent" />
      </div>
      {slippageBps > 300 && <div className="text-[12px] text-neg mt-1">High tolerance: a front-runner can take up to {slippageBps / 100}% of your output.</div>}
      <div className="label mt-1 num">After-fee quote at slot {viewSlot || "—"}; tolerance covers only state changes before execution.</div>

      {networkMismatch && <div className="text-[12px] text-neg mt-2" role="alert">Wallet is on {walletNet}; this site is configured for {NETWORK}.</div>}
      {insufficient && <div className="text-[12px] text-neg mt-2" role="alert">Insufficient balance (including rent and fees).</div>}

      <button
        className={`btn btn-lg w-full mt-4 ${side === "buy" ? "btn-green" : ""}`}
        disabled={!wallet.connected || !q?.ok || stage !== "idle" || !!networkMismatch || !!insufficient}
        onClick={() => void submit()}
      >
        {!wallet.connected ? "Connect wallet" : stage === "idle" ? `${side === "buy" ? "Buy" : "Sell"} ${summary.symbol}` : stage === "quoting" ? "Re-quoting…" : stage === "simulating" ? "Simulating…" : stage === "signing" ? "Approve in wallet…" : "Pending…"}
      </button>

      {status && (
        <div className={`mt-3 rounded-lg p-2.5 text-[12px] ${status.tone === "green" ? "bg-green-dim text-green" : status.tone === "neg" ? "bg-[#3a1f24] text-neg" : "raised text-muted"}`} role="status" aria-live="polite">
          <div className="font-medium">{status.text}</div>
          {sig && status.tone === "green" && <a className="link addr break-all" href={explorerTx(sig)} target="_blank" rel="noreferrer">{sig}</a>}
          {error && !rejected && <div className="mt-1 whitespace-pre-wrap break-all">{error}</div>}
        </div>
      )}
      <p className="label mt-3">Exact input, fill-or-kill, simulated before you sign. The on-chain minimum output is the final protection.</p>
    </div>
  );
}

function Row({ k, v, strong, tone }: { k: string; v: string; strong?: boolean; tone?: "green" | "neg" | "violet" }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted">{k}</span>
      <span className={`text-right ${strong ? "text-text text-[14px] font-semibold" : ""} ${tone === "green" ? "text-green" : tone === "neg" ? "text-neg" : tone === "violet" ? "text-violet" : ""}`}>{v}</span>
    </div>
  );
}
