"use client";
/**
 * Create a coin in two steps: (1) name, ticker, image, description, links; (2) preview with the fixed
 * launch terms and the exact costs, then publish. Publishing = sign a message (metadata upload, no funds)
 * + one transaction (create_launch). The creation fee is only ever charged by that transaction, so an
 * abandoned draft costs nothing. The mint keypair is generated here and kept in this browser until the
 * launch exists, so a failed transaction can be retried without a second draft or a second fee.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider } from "@anchor-lang/core";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { PopLaunchClient, launchPda } from "@pop/sdk";
import { api } from "@/lib/api";
import { API_URL, NETWORK, SIGN_DOMAIN, explorerTx } from "@/lib/config";
import { V1, fmtSol, fmtTokens, launchPriceSolPerToken } from "@/lib/launch";
import { canonical, draftMessage, hexToBytes, sha256Hex } from "@/lib/sign";
import { IDLE, runTx, type TxState } from "@/lib/tx";

const KEY = "poplaunch.create.pending";
interface Pending { mintSecret: number[]; name: string; symbol: string; uri: string; metadataHash: string; image: string; network: string; apiUrl: string; programId: string }

/**
 * The only server-produced values that go on chain are the metadata uri and its hash. Re-derive both in the
 * browser from the document the uri serves, and check it says what the wallet signed, so a compromised or
 * mis-pointed backend cannot pin someone else's metadata on a launch.
 */
async function verifyDraft(d: { uri: string; metadataHash: string }, expect: { name: string; symbol: string; mint: string }) {
  if (!d.uri.startsWith(`${API_URL}/api/launches/`)) throw new Error("metadata uri points outside this Pop Launch backend");
  const r = await fetch(d.uri, { cache: "no-store" });
  if (!r.ok) throw new Error("metadata document could not be read back");
  const json = (await r.json()) as { name?: string; symbol?: string; properties?: { launch?: { mint?: string; network?: string } } };
  if ((await sha256Hex(canonical(json))) !== d.metadataHash) throw new Error("metadata hash does not match the document");
  if (json.name !== expect.name || json.symbol !== expect.symbol || json.properties?.launch?.mint !== expect.mint) throw new Error("metadata document does not match what you signed");
  if (json.properties?.launch?.network !== NETWORK) throw new Error(`metadata is for ${json.properties?.launch?.network}, this app is on ${NETWORK}`);
}

const fmtDuration = (secs: number) => (secs >= 3600 ? `${+(secs / 3600).toFixed(2)} hours` : `${+(secs / 60).toFixed(1)} minutes`);
const clean = (s: string, max: number) => s.replace(/[\u0000-\u001f\u007f<>]/g, "").slice(0, max);

export function CreateCoin() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const router = useRouter();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [x, setX] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [terms, setTerms] = useState<{ target: bigint; fee: bigint; minReserve: bigint; window: bigint; timeout: bigint; feeRecipient: PublicKey } | null>(null);
  const [reserve, setReserve] = useState<{ total: bigint; parts: Record<string, bigint> } | null>(null);
  const [rent, setRent] = useState<bigint | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [phase, setPhase] = useState<"idle" | "signing-message" | "uploading" | "tx">("idle");
  const [tx, setTx] = useState<TxState>(IDLE);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as Pending;
      // A draft made for another cluster or backend must never be published here.
      if (p.network !== NETWORK || p.apiUrl !== API_URL || p.programId !== PopLaunchClient.readOnly(connection).programId.toBase58()) { localStorage.removeItem(KEY); return; }
      setPending(p);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    const c = PopLaunchClient.readOnly(connection);
    c.fetchConfig().then(async (cfg) => {
      const s = cfg.settings;
      const t = { target: BigInt(s.targetLamports.toString()), fee: BigInt(s.creationFeeLamports.toString()), minReserve: BigInt(s.minSetupReserveLamports.toString()), window: BigInt(s.fundingWindowSecs.toString()), timeout: BigInt(s.settlementTimeoutSecs.toString()), feeRecipient: s.feeRecipient };
      setTerms(t);
      // Raydium's creation fee comes from its AmmConfig (u64 at offset 8+1+1+2+8+8+8).
      const info = await connection.getAccountInfo(s.ammConfig);
      const createPoolFee = info ? info.data.readBigUInt64LE(8 + 1 + 1 + 2 + 8 + 8 + 8) : 150_000_000n;
      setReserve(await c.quoteSetupReserve(createPoolFee, t.minReserve));
      const launchSize = c.program.account.launch.size;
      const r = async (n: number) => BigInt(await connection.getMinimumBalanceForRentExemption(n));
      setRent((await r(82)) + (await r(launchSize)) + 2n * (await r(165)));
    }).catch((e) => setError(`Could not read the protocol settings: ${(e as Error).message}`));
  }, [connection]);
  useEffect(() => {
    if (!wallet.publicKey) { setBalance(null); return; }
    connection.getBalance(wallet.publicKey).then((b) => setBalance(BigInt(b))).catch(() => {});
  }, [wallet.publicKey, connection, tx.stage]);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const validName = name.trim().length >= 1 && name.length <= 32;
  const validSymbol = /^[A-Z0-9]{1,10}$/.test(symbol);
  const validFile = !!file && file.size <= 1_048_576 && /^image\/(png|jpeg|gif|webp)$/.test(file.type);
  const validUrl = !website || /^https:\/\/\S+$/.test(website);
  const validX = !x || /^@?[A-Za-z0-9_]{1,15}$/.test(x);
  const valid = validName && validSymbol && validFile && validUrl && validX && description.length <= 500;
  const total = useMemo(() => (terms && reserve && rent ? terms.fee + reserve.total + rent + 2_000_000n : null), [terms, reserve, rent]);
  const insufficient = total !== null && balance !== null && balance < total;

  async function publish(resume?: Pending) {
    if (!wallet.publicKey || !wallet.signMessage || !wallet.signTransaction || !terms || !reserve) return;
    setError(null);
    let p = resume ?? null;
    try {
      if (!p) {
        if (!file) return;
        const mint = Keypair.generate();
        const signedAt = Math.floor(Date.now() / 1000);
        const payload = JSON.stringify({ name: name.trim(), symbol, description: description.trim(), website: website.trim(), x: x.trim().replace(/^@/, ""), mint: mint.publicKey.toBase58() });
        setPhase("signing-message");
        const msg = new TextEncoder().encode(draftMessage(SIGN_DOMAIN, await sha256Hex(payload), signedAt));
        const sig = await wallet.signMessage(msg);
        setPhase("uploading");
        const form = new FormData();
        form.set("payload", payload);
        form.set("signer", wallet.publicKey.toBase58());
        form.set("signature", bs58.encode(sig));
        form.set("signedAt", String(signedAt));
        form.set("image", file);
        const d = await api.postDraft(form);
        await verifyDraft(d, { name: name.trim(), symbol, mint: mint.publicKey.toBase58() });
        p = { mintSecret: [...mint.secretKey], name: name.trim(), symbol, uri: d.uri, metadataHash: d.metadataHash, image: d.image, network: NETWORK, apiUrl: API_URL, programId: PopLaunchClient.readOnly(connection).programId.toBase58() };
        localStorage.setItem(KEY, JSON.stringify(p));
        setPending(p);
      }
      setPhase("tx");
      const mint = Keypair.fromSecretKey(Uint8Array.from(p.mintSecret));
      const existing = await connection.getAccountInfo(launchPda(mint.publicKey));
      if (!existing) {
        const client = new PopLaunchClient(new AnchorProvider(connection, wallet as never, { commitment: "confirmed" }));
        const ix = await client.createLaunchIx(wallet.publicKey, mint.publicKey, { name: p.name, symbol: p.symbol, uri: p.uri, metadataHash: hexToBytes(p.metadataHash), setupReserveLamports: reserve.total }, terms.feeRecipient);
        const t = new Transaction().add(ix);
        t.feePayer = wallet.publicKey;
        t.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        t.partialSign(mint);
        const sig = await runTx(connection, wallet, t, setTx);
        if (!sig) { setPhase("idle"); return; }
      }
      localStorage.removeItem(KEY);
      setPending(null);
      router.push(`/launch/${mint.publicKey.toBase58()}?created=1`);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      setError(/rejected/i.test(msg) ? "Signature rejected in your wallet. Nothing was uploaded or sent." : msg);
      setPhase("idle");
    }
  }

  const busy = phase !== "idle";
  const field = (label: string, input: React.ReactNode, hint?: string) => (
    <label className="block">
      <span className="font-bold">{label}</span>
      {input}
      {hint && <span className="label block mt-1">{hint}</span>}
    </label>
  );

  return (
    <div className="mt-6 max-w-[560px]">
      {pending && phase === "idle" && (
        <div className="box p-4 mb-5">
          <div className="font-bold">Unfinished launch: {pending.name} ({pending.symbol})</div>
          <p className="label mt-1">Its metadata was uploaded but the creation transaction did not confirm. Publishing again reuses the same draft and mint, so there is no second fee.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn btn-red btn-sm" disabled={!wallet.connected} onClick={() => void publish(pending)}>Publish it now</button>
            <button type="button" className="btn btn-sm" onClick={() => { localStorage.removeItem(KEY); setPending(null); }}>Discard draft</button>
          </div>
        </div>
      )}
      <ol className="flex gap-2 label mb-4" aria-label="Steps">
        <li className={step === 1 ? "font-bold text-ink" : ""}>1. Your coin</li><li aria-hidden>→</li><li className={step === 2 ? "font-bold text-ink" : ""}>2. Preview and publish</li>
      </ol>
      {step === 1 ? (
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (valid) setStep(2); }}>
          {field("Name", <input className="input mt-1" value={name} onChange={(e) => setName(clean(e.target.value, 32))} placeholder="CAT.EXE" maxLength={32} required />, "Up to 32 characters. Fixed once published.")}
          {field("Ticker", <input className="input mt-1 w-44 uppercase block" value={symbol} onChange={(e) => setSymbol(clean(e.target.value.toUpperCase(), 10).replace(/[^A-Z0-9]/g, ""))} placeholder="CATEXE" maxLength={10} required />, "1 to 10 letters or digits. Fixed once published.")}
          {field("Image", <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="block mt-1 text-[15px]" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />, "PNG, JPEG, GIF or WebP up to 1 MB. Square works best in the balloon.")}
          {preview && <img src={preview} alt="" className="w-24 h-24 rounded-full border-[3px] border-ink object-cover" />}
          {file && !validFile && <p className="text-red-deep text-[15px]">That file type or size is not accepted.</p>}
          {field("Short description", <textarea className="input mt-1 py-3" rows={3} value={description} onChange={(e) => setDescription(clean(e.target.value, 500))} />, `${description.length}/500`)}
          <div className="grid sm:grid-cols-2 gap-4">
            {field("Website (optional)", <input className="input mt-1" value={website} onChange={(e) => setWebsite(clean(e.target.value, 200))} placeholder="https://" inputMode="url" />)}
            {field("X handle (optional)", <input className="input mt-1" value={x} onChange={(e) => setX(clean(e.target.value, 16))} placeholder="@handle" />)}
          </div>
          <button type="submit" className="btn btn-red btn-lg w-full" disabled={!valid}>Preview launch</button>
          <p className="label">Images and text are checked and stored by Pop Launch; the on-chain launch pins their hash so they cannot change afterwards. No HTML, no scripts.</p>
        </form>
      ) : (
        <div className="space-y-5">
          <div className="box p-5 flex items-center gap-4">
            {preview && <img src={preview} alt="" className="w-20 h-20 rounded-full border-[3px] border-ink object-cover shrink-0" />}
            <div className="min-w-0"><div className="display text-[28px] truncate">{name}</div><div className="mono font-bold">${symbol}</div>{description && <p className="label mt-1 line-clamp-2">{description}</p>}</div>
          </div>
          <div className="box p-5">
            <div className="display text-[20px]">Standard launch terms</div>
            <dl className="mt-3 space-y-2 text-[15px]">
              {terms ? <>
                <div className="flex justify-between gap-3"><dt className="text-muted">Target</dt><dd className="num">{fmtSol(terms.target, 0)} SOL</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Funding window</dt><dd className="num">{fmtDuration(Number(terms.window))} from opening</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Settlement timeout</dt><dd className="num">{fmtDuration(Number(terms.timeout))} after the target</dd></div>
              </> : <div className="label">Reading protocol settings…</div>}
              <div className="flex justify-between gap-3"><dt className="text-muted">Supply</dt><dd className="num">{fmtTokens(V1.supplyBaseUnits, V1.decimals)} {symbol}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Allocation</dt><dd className="text-right">50% to backers, 50% into the pool with all the SOL</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Your allocation</dt><dd>0. You can back on the same terms as anyone.</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Launch price</dt><dd className="num">{launchPriceSolPerToken(terms?.target ?? V1.targetLamports, V1.poolAllocation, V1.decimals)} SOL per {symbol}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Liquidity</dt><dd className="text-right">LP tokens will be burned at launch</dd></div>
            </dl>
            <p className="label mt-3">These terms are fixed by the protocol and cannot be customized, extended, retargeted or canceled once published.</p>
          </div>
          <div className="box p-5">
            <div className="display text-[20px]">What you pay</div>
            <dl className="mt-3 space-y-2 text-[15px]">
              <div className="flex justify-between gap-3"><dt className="text-muted">Creation fee (only if creation succeeds)</dt><dd className="num">{terms ? `${fmtSol(terms.fee)} SOL` : "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Setup reserve for pool costs</dt><dd className="num">{reserve ? `${fmtSol(reserve.total)} SOL` : "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Account rent (mint, launch, vaults)</dt><dd className="num">{rent !== null ? `${fmtSol(rent)} SOL` : "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Network fees</dt><dd className="num">about 0.002 SOL</dd></div>
              <div className="flex justify-between gap-3 border-t-2 border-ink pt-2 font-bold"><dt>Total now</dt><dd className="num">{total !== null ? `${fmtSol(total)} SOL` : "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Wallet balance</dt><dd className="num">{balance === null ? "not connected" : `${fmtSol(balance)} SOL`}</dd></div>
            </dl>
            {reserve && <p className="label mt-3">The reserve pays Raydium’s pool creation fee ({fmtSol(reserve.parts.createPoolFee ?? 0n)} SOL) and the rent of the accounts settlement creates. Whatever is not used comes back to you after the launch is live or refundable. Anyone can top it up later without gaining any rights.</p>}
          </div>
          {insufficient && <p className="text-red-deep text-[15px]" role="alert">Your wallet needs {total !== null ? fmtSol(total) : "—"} SOL to publish.</p>}
          {error && <p className="text-red-deep text-[15px]" role="alert">{error}</p>}
          {tx.stage !== "idle" && (
            <div className={`rounded-xl border-2 border-ink p-3 text-[15px] ${tx.stage === "confirmed" ? "bg-[#bff0c6]" : tx.stage === "failed" ? "bg-[#ffd3cf]" : "bg-yellow"}`} role="status" aria-live="polite">
              <div className="font-bold">{tx.stage === "signing" ? "Approve the creation transaction in your wallet…" : tx.stage === "pending" ? "Creating your launch on chain…" : tx.stage === "confirmed" ? "Published." : tx.error}</div>
              {tx.signature && <a className="link addr text-[13px] break-all" href={explorerTx(tx.signature)} target="_blank" rel="noreferrer noopener">{tx.signature}</a>}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn" disabled={busy} onClick={() => setStep(1)}>Back</button>
            <button type="button" className="btn btn-red btn-lg flex-1" disabled={busy || !wallet.connected || !terms || !reserve || !!insufficient} onClick={() => void publish()}>
              {!wallet.connected ? "Connect a wallet to publish" : phase === "signing-message" ? "Sign the metadata message…" : phase === "uploading" ? "Uploading metadata…" : phase === "tx" ? "Publishing…" : "Publish launch"}
            </button>
          </div>
          <p className="label">Publishing asks for one message signature (uploads the metadata, moves nothing) and one transaction (creates the mint, the launch and its vaults). The creation fee is charged only by that transaction. <Link href="/how-it-works" className="link">How it works</Link>.</p>
        </div>
      )}
    </div>
  );
}
