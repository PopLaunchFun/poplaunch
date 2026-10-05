"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { NATIVE_MINT, getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import { AnchorProvider } from "@anchor-lang/core";
import { PopClient, type MarketView } from "@pop/sdk";
import type { SwapOutcome } from "@pop/math";
import type { MarketSummary } from "@/lib/api";
import { NETWORK, explorerTx } from "@/lib/config";
import { readClient, connection as rpc } from "@/lib/chain";
import { fmtSol, fmtBase, fmtPrice, priceX64ToHuman, fmtUsd } from "@/lib/format";
import { useSolUsd } from "@/lib/usd";

type Stage = "idle" | "quoting" | "simulating" | "signing" | "confirming";

export function TradeTicket({ summary, onClose }: { summary: MarketSummary; onClose?: () => void }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const solUsd = useSolUsd();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("0.1");
  const [slippageBps, setSlippageBps] = useState(100);
  const [view, setView] = useState<MarketView | null>(null);
  const [viewSlot, setViewSlot] = useState<number>(0);
  const [quote, setQuote] = useState<SwapOutcome | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [balances, setBalances] = useState<{ sol: bigint; base: bigint } | null>(null);
  const [walletNet, setWalletNet] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const market = new PublicKey(summary.address);
  const dec = summary.baseDecimals;

  const refresh = useCallback(async () => {
    try {
      const c = readClient();
      const v = await c.fetchMarket(market);
      setView(v);
      setViewSlot(await rpc().getSlot("confirmed"));
      setError(null);
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
    const load = async () => {
      const sol = BigInt(await connection.getBalance(wallet.publicKey!));
      let base = 0n;
      try {
        base = (await getAccount(connection, getAssociatedTokenAddressSync(new PublicKey(summary.baseMint), wallet.publicKey!))).amount;
      } catch {
        base = 0n;
      }
      setBalances({ sol, base });
      try {
        const hash = await connection.getGenesisHash();
        setWalletNet(hash === "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d" ? "mainnet-beta" : hash === "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG" ? "devnet" : "localnet/custom");
      } catch {
        setWalletNet(null);
      }
    };
    void load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [wallet.publicKey, connection, summary.baseMint, sig]);

  const gross = (() => {
    try {
      const n = Number(amount);
      if (!isFinite(n) || n <= 0) return 0n;
      return side === "buy" ? BigInt(Math.round(n * 1e9)) : BigInt(Math.round(n * 10 ** dec));
    } catch {
      return 0n;
    }
  })();

  useEffect(() => {
    if (!view || gross === 0n) {
      setQuote(null);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setQuote(readClient().quote(view, side, gross));
    }, 150);
  }, [view, side, gross]);

  const minOutput = quote?.ok ? (quote.output * BigInt(10_000 - slippageBps)) / 10_000n : 0n;
  const networkMismatch = walletNet && NETWORK !== walletNet && !(NETWORK === "localnet" && walletNet === "localnet/custom");
  const insufficient = balances && gross > 0n && (side === "buy" ? balances.sol < gross + 10_000_000n : balances.base < gross);

  async function submit() {
    if (!wallet.publicKey || !wallet.signTransaction || !view || !quote?.ok) return;
    setError(null);
    setSig(null);
    try {
      setStage("quoting");
      const fresh = await readClient().fetchMarket(market);
      const q = readClient().quote(fresh, side, gross);
      if (!q.ok) throw new Error(`State changed: ${q.error}. ${q.detail}`);
      if (q.output < minOutput) throw new Error(`State changed: quote now ${q.output} < your minimum ${minOutput}. Re-quote before sending.`);
      const slot = await connection.getSlot("confirmed");
      const provider = new AnchorProvider(connection, wallet as never, { commitment: "confirmed" });
      const client = new PopClient(provider);
      const tx = await client.buildSwapTransaction(wallet.publicKey, fresh, q, { isBuy: side === "buy", grossInput: gross, minOutput, deadlineSlot: BigInt(slot + 150), unwrap: side === "sell" });
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
      await refresh();
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      setError(msg.includes("User rejected") ? "Rejected in wallet." : msg.includes("block height exceeded") || msg.includes("expired") ? "Blockhash expired before confirmation. Nothing was executed; re-quote and try again." : msg);
    } finally {
      setStage("idle");
    }
  }

  const q = quote;
  const impact = q?.ok ? priceX64ToHuman(q.endPriceX64, dec) / priceX64ToHuman(q.startPriceX64, dec) - 1 : null;
  const avg = q?.ok && q.avgPriceX64 ? priceX64ToHuman(q.avgPriceX64, dec) : null;
  const staleView = view && viewSlot > 0 && Date.now() - 0 > 0 && false;

  return (
    <div className="panel p-4 text-sm">
      <div className="flex justify-between items-center">
        <div className="flex gap-1">
          <button className={`btn px-3 py-1 ${side === "buy" ? "btn-primary" : ""}`} onClick={() => setSide("buy")}>Buy</button>
          <button className={`btn px-3 py-1 ${side === "sell" ? "btn-primary" : ""}`} onClick={() => setSide("sell")}>Sell</button>
        </div>
        {onClose && <button className="text-paper-3" onClick={onClose}>close</button>}
      </div>
      <label className="block mt-4">
        <span className="label">{side === "buy" ? "Pay (SOL)" : `Sell (${summary.symbol})`}</span>
        <input className="input mt-1 text-lg" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
      </label>
      <div className="flex justify-between text-xs text-paper-3 mt-1">
        <span>Wallet: {balances ? (side === "buy" ? fmtSol(balances.sol) : fmtBase(balances.base, dec, summary.symbol)) : "not connected"}</span>
        {balances && <button className="link" onClick={() => setAmount(side === "buy" ? (Math.max(0, Number(balances.sol) / 1e9 - 0.02)).toFixed(4) : (Number(balances.base) / 10 ** dec).toString())}>max</button>}
      </div>

      <div className="mt-4 space-y-1 num text-xs">
        {!view && !error && <div className="text-paper-3">Loading live market state…</div>}
        {q && !q.ok && <div className="text-scar">{q.error === "TraversalLimit" ? `Insufficient depth within 32 bins for this size. Split into smaller trades (each needs its own signature and quote). ${q.detail}` : q.error === "BuyInventoryExhausted" || q.error === "SellInventoryExhausted" ? `Insufficient depth: ${q.detail}` : q.error === "InputBelowMinimum" ? `Below minimum input (${side === "buy" ? fmtSol(summary ? 100000 : 0) : "1 token"}).` : `${q.error}: ${q.detail}`}</div>}
        {q?.ok && (
          <>
            <Row k="You receive" v={side === "buy" ? fmtBase(q.output, dec, summary.symbol) : fmtSol(q.output)} strong />
            <Row k="Minimum after slippage" v={side === "buy" ? fmtBase(minOutput, dec, summary.symbol) : fmtSol(minOutput)} />
            <Row k="Average price" v={avg ? `${fmtPrice(avg)} SOL` : "–"} />
            <Row k="Price impact (cursor → end bin)" v={impact !== null ? `${(impact * 100).toFixed(2)}% · ${q.binsInspected} bins` : "–"} />
            <div className="border-t border-line my-1" />
            <Row k="Scar fee 1.50%" v={side === "buy" ? fmtSol(q.fees.scarFee) : fmtBase(q.fees.scarFee, dec, summary.symbol)} tone="scar" />
            <Row k="Protocol fee 0.25%" v={side === "buy" ? fmtSol(q.fees.protocolFee) : fmtBase(q.fees.protocolFee, dec, summary.symbol)} />
            <Row k="Creator fee 0.25%" v={side === "buy" ? fmtSol(q.fees.creatorFee) : fmtBase(q.fees.creatorFee, dec, summary.symbol)} />
            <Row k="Net traded" v={side === "buy" ? fmtSol(q.fees.tradable) : fmtBase(q.fees.tradable, dec, summary.symbol)} />
            <Row k="Network fee + rent" v={`≈ 0.000005 SOL${balances && side === "buy" && balances.base === 0n ? " + 0.002 SOL ATA rent" : ""}`} />
            {side === "buy" && <Row k="USD (indicative)" v={fmtUsd(solUsd === null ? null : (Number(gross) / 1e9) * solUsd)} />}
          </>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs">
        <span className="text-paper-3">Slippage (on after-fee output)</span>
        {[50, 100, 300].map((b) => (
          <button key={b} className={`tag ${slippageBps === b ? "tag-lime" : ""}`} onClick={() => setSlippageBps(b)}>{b / 100}%</button>
        ))}
        <input className="input w-16 py-0.5 text-xs" value={slippageBps / 100} onChange={(e) => { const v = Number(e.target.value); if (isFinite(v) && v >= 0 && v <= 50) setSlippageBps(Math.round(v * 100)); }} />
      </div>
      {slippageBps > 300 && <div className="text-xs text-scar mt-1">High tolerance: a front-runner can take up to {slippageBps / 100}% of your output.</div>}
      <div className="text-xs text-paper-3 mt-1">Quotes are after the 2% protocol fees; tolerance covers only state changes between quote and execution. Deadline: 150 slots (~1 min). Last quote from slot {viewSlot || "–"}.</div>

      {networkMismatch && <div className="text-xs text-scar mt-2">Wallet is on {walletNet}; this site is configured for {NETWORK}.</div>}
      {insufficient && <div className="text-xs text-scar mt-2">Insufficient balance.</div>}
      {error && <div className="text-xs text-scar mt-2 whitespace-pre-wrap break-all">{error}</div>}
      {sig && <div className="text-xs text-lime mt-2 break-all">Executed. <a className="link" href={explorerTx(sig)} target="_blank" rel="noreferrer">{sig}</a></div>}
      {staleView && null}

      <button
        className={`btn w-full mt-4 ${side === "buy" ? "btn-scar" : "btn-primary"}`}
        disabled={!wallet.connected || !q?.ok || stage !== "idle" || !!networkMismatch || !!insufficient}
        onClick={() => void submit()}
      >
        {!wallet.connected ? "Connect wallet" : stage === "idle" ? `${side === "buy" ? "Buy" : "Sell"} ${summary.symbol}` : stage === "quoting" ? "Re-quoting…" : stage === "simulating" ? "Simulating…" : stage === "signing" ? "Approve in wallet…" : "Confirming…"}
      </button>
      <p className="text-xs text-paper-3 mt-3">Exact input, fill-or-kill. The transaction is simulated before you sign. The on-chain minimum output is final protection; this quote is a prediction over the state it was computed from.</p>
    </div>
  );
}

function Row({ k, v, strong, tone }: { k: string; v: string; strong?: boolean; tone?: "scar" }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-paper-3 font-sans">{k}</span>
      <span className={`${strong ? "text-paper text-sm" : ""} ${tone === "scar" ? "text-scar" : ""}`}>{v}</span>
    </div>
  );
}
