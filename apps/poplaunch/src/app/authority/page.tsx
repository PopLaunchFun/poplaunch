import Link from "next/link";
import { NETWORK, explorerAddress, IS_MAINNET, DEMO } from "@/lib/config";
import { LAUNCH_PROGRAM_ID, NETWORKS, TOKEN_METADATA_PROGRAM_ID } from "@pop/sdk";

export const metadata = { title: "Who controls what — Pop Launch" };

const net = NETWORKS[(NETWORK === "demo" ? "localnet" : NETWORK) as keyof typeof NETWORKS];

function Addr({ a }: { a: string }) {
  return DEMO ? <span className="addr">{a}</span> : <a className="link addr" href={explorerAddress(a)} target="_blank" rel="noreferrer noopener">{a}</a>;
}

/** Plain-language authority disclosure. Source of truth: docs/authority-disclosure.md. */
export default function Authority() {
  const rows: [string, React.ReactNode, string, string][] = [
    ["Program upgrade authority", IS_MAINNET ? "One key, the owner's wallet jNdwn3…tnx. No multisig." : "Deployer key (test cluster)", "Replace the program code.", "This is the one key that could change escrow rules, and it is a single key held by the owner, not a committee. Upgrades will be announced before they happen, and the authority will be set to none once the mechanism has run unchanged for a disclosed period."],
    ["Protocol authority", IS_MAINNET ? "The same owner wallet" : "Deployer key (test cluster)", "Change the terms for new launches; pause new launches; hand this role to another key.", "Cannot touch an existing launch: its terms are copied into the launch at opening. Cannot stop settlement, claims or refunds. Cannot move any SOL or tokens."],
    ["Creation-fee recipient", IS_MAINNET ? "The owner's wallet jNdwn3…tnx" : "Deployer key (test cluster)", "Receives the creation fee (0 during the opening 24 hours, then 0.1 SOL).", "Nothing else."],
    ["Settlement keeper", "A fee wallet run by Pop Launch", "Submits the public settlement instruction for filled launches.", "No privilege at all: anyone can submit the same instruction from the launch page. If the keeper is down, settlement is late, not lost; after 60 minutes backers refund."],
    ["Raydium", "External program", "Runs the pool; its admin sets fee tiers and can pause new pool creation.", "Has no access to pooled assets. A launch that cannot create its pool refunds."],
    ["Creator of a coin", "Any wallet", "Picks the name, ticker and image; pays the creation fee and setup reserve; backs on the same terms as anyone.", "Gets no tokens, no fee from backers, cannot cancel, extend or change a launch, cannot rename or re-image the coin after opening."],
  ];
  return (
    <div className="mx-auto max-w-[900px] px-4 md:px-8 pt-6 md:pt-10 pb-16 text-[16px]">
      <h1 className="display text-[40px] md:text-[56px]">Who controls what</h1>
      <p className="font-bold text-[18px] mt-3 max-w-[60ch]">Pop Launch is not trustless while a key can upgrade the program. This page says exactly who holds which power, and what each key cannot do.</p>
      <div className="mt-8 space-y-4">
        {rows.map(([who, held, can, cannot]) => (
          <section key={who} className="box p-5 md:p-6">
            <h2 className="display text-[22px]">{who}</h2>
            <dl className="mt-3 grid md:grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-[15px]">
              <dt className="text-muted">Held by</dt><dd>{held}</dd>
              <dt className="text-muted">Can</dt><dd>{can}</dd>
              <dt className="text-muted">Cannot</dt><dd>{cannot}</dd>
            </dl>
          </section>
        ))}
      </div>
      <h2 className="display text-[28px] mt-12">Addresses on {NETWORK === "demo" ? "localnet (demo)" : NETWORK}</h2>
      <p className="label mt-2">Every address a launch depends on is fixed at opening and verified live before any cluster goes public (<code className="mono">verify:addresses</code> in the repository).</p>
      <dl className="mt-4 space-y-2 text-[15px]">
        <div className="grid md:grid-cols-[14rem_1fr] gap-x-4"><dt className="text-muted">Pop Launch program</dt><dd className="break-all"><Addr a={LAUNCH_PROGRAM_ID.toBase58()} /></dd></div>
        <div className="grid md:grid-cols-[14rem_1fr] gap-x-4"><dt className="text-muted">Raydium CP-Swap</dt><dd className="break-all"><Addr a={net.cpSwapProgram.toBase58()} /></dd></div>
        <div className="grid md:grid-cols-[14rem_1fr] gap-x-4"><dt className="text-muted">Raydium pool-creation fee receiver</dt><dd className="break-all"><Addr a={net.createPoolFeeReceiver.toBase58()} /></dd></div>
        <div className="grid md:grid-cols-[14rem_1fr] gap-x-4"><dt className="text-muted">Token Metadata program</dt><dd className="break-all"><Addr a={TOKEN_METADATA_PROGRAM_ID.toBase58()} /></dd></div>
        <div className="grid md:grid-cols-[14rem_1fr] gap-x-4"><dt className="text-muted">Wrapped SOL</dt><dd className="break-all"><Addr a={net.wsolMint.toBase58()} /></dd></div>
      </dl>
      <h2 className="display text-[28px] mt-12">What every coin gets, automatically</h2>
      <ul className="mt-3 space-y-2 text-[15px] list-disc pl-5">
        <li>The whole supply is minted into program vaults when the launch opens, then the mint authority is revoked. No freeze authority is ever set.</li>
        <li>Token metadata is written once, immutable, with the launch itself as its update authority.</li>
        <li>Backed SOL sits in a launch-specific escrow that only the program can move, and only into the pool or back to the backer.</li>
        <li>At settlement every LP token the pool issues is burned in the same transaction. Nobody can withdraw the pooled SOL and tokens.</li>
      </ul>
      <p className="label mt-8">The full disclosure, including the mainnet multisig once it exists, is maintained in the repository as <code className="mono">docs/authority-disclosure.md</code>. See also <Link href="/how-it-works" className="link">How it works</Link> and the <Link href="/terms" className="link">Terms</Link>.</p>
    </div>
  );
}
