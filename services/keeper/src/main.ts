import { readFileSync } from "node:fs";
import { AnchorProvider, type Wallet } from "@anchor-lang/core";
import { AddressLookupTableAccount, ComputeBudgetProgram, Connection, Keypair, PublicKey, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { NATIVE_MINT, createAssociatedTokenAccountIdempotentInstruction, createBurnInstruction, getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PopClient } from "@pop/sdk";

const args = process.argv.slice(2).filter((a) => a !== "--");
const cmd = args[0] ?? "status";
const flag = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const dryRun = args.includes("--dry-run");
const rpc = process.env.RPC_URL ?? "http://127.0.0.1:8899";
const jupiter = process.env.JUPITER_API_URL ?? "https://lite-api.jup.ag/swap/v1";
const slippageBps = Number(process.env.SLIPPAGE_BPS ?? 100);
const maxAmount = BigInt(process.env.MAX_AMOUNT ?? "1000000000");

class KeypairWallet implements Wallet {
  constructor(readonly payer: Keypair) {}
  get publicKey() { return this.payer.publicKey; }
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> { if (tx instanceof Transaction) tx.partialSign(this.payer); else tx.sign([this.payer]); return tx; }
  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> { for (const t of txs) await this.signTransaction(t); return txs; }
}

function loadKeypair(): Keypair {
  const path = process.env.KEEPER_KEYPAIR;
  if (!path) throw new Error("KEEPER_KEYPAIR not set");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

const connection = new Connection(rpc, "confirmed");

async function status() {
  const client = PopClient.readOnly(connection);
  const cfg = await client.fetchProtocol();
  const bb = await client.fetchBuybackVault();
  const bal = await connection.getTokenAccountBalance(bb.quoteAccount).then((r) => r.value.amount).catch(() => "0");
  console.log(JSON.stringify({ popMint: cfg.popMint.toBase58(), authority: bb.authority.toBase58(), escrowLamports: bal, totalReceived: bb.totalReceived.toString(), totalWithdrawn: bb.totalWithdrawn.toString(), maxWithdrawPerExecution: bb.maxWithdrawPerExecution.toString(), minIntervalSlots: bb.minIntervalSlots.toString(), lastWithdrawalSlot: bb.lastWithdrawalSlot.toString() }, null, 2));
}

async function jupiterIxs(inputMint: PublicKey, outputMint: PublicKey, amount: bigint, user: PublicKey, destination: PublicKey) {
  const q = await fetch(`${jupiter}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}&restrictIntermediateTokens=true`);
  if (!q.ok) throw new Error(`jupiter quote ${q.status}: ${await q.text()}`);
  const quote = (await q.json()) as { otherAmountThreshold: string; outAmount: string };
  const r = await fetch(`${jupiter}/swap-instructions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quoteResponse: quote, userPublicKey: user.toBase58(), wrapAndUnwrapSol: false, destinationTokenAccount: destination.toBase58(), dynamicComputeUnitLimit: true }) });
  if (!r.ok) throw new Error(`jupiter swap-instructions ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { setupInstructions?: JIx[]; swapInstruction: JIx; cleanupInstruction?: JIx; addressLookupTableAddresses?: string[] };
  const conv = (ix: JIx) => new TransactionInstruction({ programId: new PublicKey(ix.programId), keys: ix.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })), data: Buffer.from(ix.data, "base64") });
  const ixs = [...(j.setupInstructions ?? []).map(conv), conv(j.swapInstruction), ...(j.cleanupInstruction ? [conv(j.cleanupInstruction)] : [])];
  const luts: AddressLookupTableAccount[] = [];
  for (const a of j.addressLookupTableAddresses ?? []) {
    const info = await connection.getAddressLookupTable(new PublicKey(a));
    if (info.value) luts.push(info.value);
  }
  return { ixs, luts, minOut: BigInt(quote.otherAmountThreshold), expectedOut: BigInt(quote.outAmount) };
}
type JIx = { programId: string; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[]; data: string };

async function atomic() {
  const kp = loadKeypair();
  const provider = new AnchorProvider(connection, new KeypairWallet(kp), { commitment: "confirmed" });
  const client = new PopClient(provider);
  const cfg = await client.fetchProtocol();
  if (cfg.popMint.equals(PublicKey.default)) throw new Error("POP mint not published on-chain (set_pop_mint)");
  const bb = await client.fetchBuybackVault();
  const escrow = BigInt(await connection.getTokenAccountBalance(bb.quoteAccount).then((r) => r.value.amount));
  const requested = BigInt(flag("amount") ?? maxAmount.toString());
  const amount = [requested, BigInt(bb.maxWithdrawPerExecution.toString()), escrow, maxAmount].reduce((a, b) => (a < b ? a : b));
  if (amount <= 0n) throw new Error("nothing to withdraw");
  const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, kp.publicKey);
  const popAta = getAssociatedTokenAddressSync(cfg.popMint, kp.publicKey);
  const prior = await getAccount(connection, popAta).then((a) => a.amount).catch(() => 0n);
  const jup = await jupiterIxs(NATIVE_MINT, cfg.popMint, amount, kp.publicKey, popAta);
  const burnAmount = prior + jup.minOut;
  const ixs: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
    createAssociatedTokenAccountIdempotentInstruction(kp.publicKey, wsolAta, kp.publicKey, NATIVE_MINT),
    createAssociatedTokenAccountIdempotentInstruction(kp.publicKey, popAta, kp.publicKey, cfg.popMint),
    await client.withdrawBuybackIx(kp.publicKey, amount),
    ...jup.ixs,
    createBurnInstruction(popAta, cfg.popMint, kp.publicKey, burnAmount),
  ];
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({ payerKey: kp.publicKey, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message(jup.luts);
  const tx = new VersionedTransaction(msg);
  const size = tx.serialize().length;
  if (size > 1232) throw new Error(`transaction too large (${size} bytes); lower --amount or use a route with fewer accounts`);
  console.log(`withdraw ${amount} lamports -> expected ${jup.expectedOut} POP (min ${jup.minOut}); burn ${burnAmount} (prior balance ${prior} carried forward); ${ixs.length} instructions, ${size} bytes`);
  const sim = await connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
  if (sim.value.err) {
    console.error("simulation failed", sim.value.err, (sim.value.logs ?? []).slice(-15).join("\n"));
    process.exit(1);
  }
  console.log(`simulation ok: ${sim.value.unitsConsumed} CU`);
  if (dryRun) return;
  tx.sign([kp]);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  console.log("executed", sig);
}

async function manualWithdraw() {
  console.warn("NON-ATOMIC MODE: the withdrawal and the burn are separate transactions. The indexer will show this withdrawal as 'burn pending' until a burn on the authority's POP account is observed.");
  const kp = loadKeypair();
  const provider = new AnchorProvider(connection, new KeypairWallet(kp), { commitment: "confirmed" });
  const client = new PopClient(provider);
  const amount = BigInt(flag("amount") ?? "0");
  if (amount <= 0n) throw new Error("--amount required");
  const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, kp.publicKey);
  const tx = new Transaction().add(createAssociatedTokenAccountIdempotentInstruction(kp.publicKey, wsolAta, kp.publicKey, NATIVE_MINT), await client.withdrawBuybackIx(kp.publicKey, amount));
  if (dryRun) { console.log("would send", tx.instructions.length, "instructions"); return; }
  console.log("withdrawn", await provider.sendAndConfirm(tx));
}

async function manualBurn() {
  const kp = loadKeypair();
  const client = PopClient.readOnly(connection);
  const cfg = await client.fetchProtocol();
  const amount = BigInt(flag("amount") ?? "0");
  if (amount <= 0n) throw new Error("--amount required (POP atomic units)");
  const popAta = getAssociatedTokenAddressSync(cfg.popMint, kp.publicKey);
  const tx = new Transaction().add(createBurnInstruction(popAta, cfg.popMint, kp.publicKey, amount));
  if (dryRun) { console.log("would burn", amount.toString(), "from", popAta.toBase58()); return; }
  const provider = new AnchorProvider(connection, new KeypairWallet(kp), { commitment: "confirmed" });
  console.log("burned", await provider.sendAndConfirm(tx));
}

const commands: Record<string, () => Promise<void>> = { status, atomic, "manual-withdraw": manualWithdraw, "manual-burn": manualBurn };
const fn = commands[cmd];
if (!fn) {
  console.error("usage: keeper status | atomic [--amount N] [--dry-run] | manual-withdraw --amount N [--dry-run] | manual-burn --amount N [--dry-run]");
  process.exit(2);
}
await fn();
