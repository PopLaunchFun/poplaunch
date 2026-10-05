"use client";
import { useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, Transaction } from "@solana/web3.js";
import { PopClient, marketPda } from "@pop/sdk";
import { AnchorProvider } from "@anchor-lang/core";
import { pageRange, quantizeP0, priceAtBin, seedAllocationForBin, POP_PILOT_DEFAULTS } from "@pop/math";
import { fmtSol, fmtBase, fmtPrice, priceX64ToHuman } from "@/lib/format";
import { explorerTx } from "@/lib/config";

const clean = (s: string, max: number) => s.replace(/[\u0000-\u001f\u007f<>]/g, "").slice(0, max);

export function LaunchForm({ network, settings, launchesEnabled }: { network: string; settings: Record<string, string | number> | null; launchesEnabled: boolean }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [uri, setUri] = useState("");
  const [supply, setSupply] = useState("1000000000");
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const seedQuote = settings ? BigInt(settings.seedQuote as string) : POP_PILOT_DEFAULTS.seedQuote;
  const binMin = settings ? Number(settings.binMin) : POP_PILOT_DEFAULTS.binMin;
  const binMax = settings ? Number(settings.binMax) : POP_PILOT_DEFAULTS.binMax;
  const supplyAtomic = useMemo(() => { try { return BigInt(supply || "0") * 1_000_000n; } catch { return 0n; } }, [supply]);
  const preview = useMemo(() => {
    try {
      if (supplyAtomic <= 0n) return null;
      const p0 = quantizeP0(seedQuote, supplyAtomic);
      const cfg = { ...POP_PILOT_DEFAULTS, seedBase: supplyAtomic, seedQuote, binMin, binMax };
      const pr = pageRange(cfg);
      return { p0, perBinBase: seedAllocationForBin(cfg, 0).seedBase, perBinQuote: seedAllocationForBin(cfg, -1).seedQuote, pages: pr.maxPage - pr.minPage + 1, pMin: priceAtBin(p0, binMin), pMax: priceAtBin(p0, binMax) };
    } catch (e) {
      return { error: (e as Error).message } as const;
    }
  }, [supplyAtomic, seedQuote, binMin, binMax]);

  const valid = name.length >= 1 && name.length <= 32 && /^[A-Z0-9]{1,10}$/.test(symbol) && uri.length <= 200 && /^https:\/\//.test(uri || "https://") && preview && !("error" in preview);

  async function launch() {
    if (!wallet.publicKey || !wallet.signTransaction || !preview || "error" in preview) return;
    setError(null);
    setLog([]);
    try {
      const provider = new AnchorProvider(connection, wallet as never, { commitment: "confirmed" });
      const client = new PopClient(provider);
      const mint = Keypair.generate();
      const market = marketPda(client.programId, mint.publicKey);
      const push = (s: string) => setLog((l) => [...l, s]);
      setBusy("Creating mint and market (1 signature)…");
      const sig1 = await provider.sendAndConfirm(new Transaction().add(await client.createMarketIx(wallet.publicKey, mint.publicKey, { name, symbol, uri: uri || "https://example.invalid/", seedBase: supplyAtomic, decimals: 6, isPopMarket: false })), [mint]);
      push(`market created ${sig1}`);
      const v = await client.fetchMarket(market, []);
      const ixs = await client.initializeAllPagesIxs(wallet.publicKey, market, v.config);
      const batches: Transaction[] = [];
      for (let i = 0; i < ixs.length; i += 6) batches.push(new Transaction().add(...ixs.slice(i, i + 6)));
      setBusy(`Creating ${ixs.length} bin pages (${batches.length} signatures, rent paid by you)…`);
      for (const [i, tx] of batches.entries()) {
        const s = await provider.sendAndConfirm(tx);
        push(`pages batch ${i + 1}/${batches.length} ${s}`);
      }
      setBusy(`Funding ${fmtSol(seedQuote)} seed and activating (1 signature)…`);
      const { NATIVE_MINT, createAssociatedTokenAccountIdempotentInstruction, createSyncNativeInstruction, getAssociatedTokenAddressSync } = await import("@solana/spl-token");
      const { SystemProgram } = await import("@solana/web3.js");
      const ata = getAssociatedTokenAddressSync(NATIVE_MINT, wallet.publicKey);
      const tx = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, ata, wallet.publicKey, NATIVE_MINT),
        SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: ata, lamports: Number(seedQuote) }),
        createSyncNativeInstruction(ata),
        await client.activateMarketIx(wallet.publicKey, market, mint.publicKey),
      );
      const sig3 = await provider.sendAndConfirm(tx);
      push(`activated ${sig3}`);
      push(`DONE market ${market.toBase58()} mint ${mint.publicKey.toBase58()}`);
      setBusy(null);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="mt-6 grid md:grid-cols-2 gap-6">
      <div className="space-y-3">
        <label className="block"><span className="label">Name (≤32)</span><input className="input mt-1" value={name} onChange={(e) => setName(clean(e.target.value, 32))} /></label>
        <label className="block"><span className="label">Symbol (A–Z, 0–9, ≤10)</span><input className="input mt-1" value={symbol} onChange={(e) => setSymbol(clean(e.target.value.toUpperCase(), 10))} /></label>
        <label className="block"><span className="label">Metadata URI (https, ≤200) · stored on-chain in the market account, immutable after activation</span><input className="input mt-1" value={uri} onChange={(e) => setUri(clean(e.target.value, 200))} placeholder="https://…/metadata.json" /></label>
        <label className="block"><span className="label">Total supply (whole tokens, 6 decimals)</span><input className="input mt-1" value={supply} onChange={(e) => setSupply(e.target.value.replace(/[^0-9]/g, ""))} /></label>
        <p className="text-xs text-paper-3">Image hosting is your responsibility (any durable HTTPS host, ≤ 1 MB recommended). The protocol stores only the URI. Metadata in the market account cannot be changed after activation.</p>
        <div className="panel p-3 text-sm">
          <div className="label">Published requirements</div>
          <ul className="mt-2 space-y-1 text-paper-2">
            <li>Seed funding: <span className="num">{fmtSol(seedQuote)}</span> wrapped SOL, locked forever in the market vault.</li>
            <li>Rent: {preview && !("error" in preview) ? preview.pages : "–"} bin pages + market + 4 vaults (≈ 0.6 SOL on mainnet, refundable never).</li>
            <li>Fees on every trade: 1.50% scar, 0.25% protocol, 0.25% creator (to your wallet, claimable).</li>
            <li>Creator allocation: none. 100% of supply is seed inventory.</li>
            <li>50% of this market&apos;s WSOL protocol fees fund POP buybacks.</li>
          </ul>
        </div>
        {!launchesEnabled && <div className="text-scar text-sm">New market creation is currently disabled by the factory.</div>}
        <button className="btn btn-scar w-full" disabled={!wallet.connected || !valid || !!busy || !launchesEnabled} onClick={() => void launch()}>
          {busy ?? (wallet.connected ? `Launch on ${network}` : "Connect a wallet to launch")}
        </button>
        {error && <div className="text-scar text-xs break-all">{error}</div>}
        {log.map((l) => (
          <div key={l} className="num text-xs text-paper-3 break-all">{l.includes(" ") ? <>{l.split(" ")[0]} <a className="link" href={explorerTx(l.split(" ").pop()!)}>{l.split(" ").slice(1).join(" ")}</a></> : l}</div>
        ))}
      </div>
      <div className="panel p-4 text-sm">
        <div className="label">Seed schedule preview</div>
        {preview && !("error" in preview) ? (
          <ul className="mt-2 space-y-1 text-paper-2">
            <li>P0 = {fmtSol(seedQuote)} / {fmtBase(supplyAtomic, 6)} = <span className="num">{fmtPrice(priceX64ToHuman(preview.p0, 6))}</span> SOL per token</li>
            <li>Bins {binMin}..{binMax}, 1% apart; price range <span className="num">{fmtPrice(priceX64ToHuman(preview.pMin, 6))}</span> → <span className="num">{fmtPrice(priceX64ToHuman(preview.pMax, 6))}</span></li>
            <li>Seed SOL: <span className="num">{fmtSol(preview.perBinQuote)}</span> in each of bins {binMin}..-1</li>
            <li>Seed tokens: <span className="num">{fmtBase(preview.perBinBase, 6)}</span> in each of bins 0..{binMax}</li>
            <li>Bin pages: {preview.pages} (16 bins each, created lazily; the launcher pre-creates them)</li>
          </ul>
        ) : (
          <div className="text-scar mt-2">{preview?.error ?? "enter a supply"}</div>
        )}
        <p className="text-xs text-paper-3 mt-4">P0 is an initialization convention, not a valuation. At P0 each token bin holds only {fmtSol(seedQuote)} ÷ {binMax + 1} of value, so early buys above ~{fmtSol(seedQuote / 13n)} must be split across transactions.</p>
      </div>
    </div>
  );
}
