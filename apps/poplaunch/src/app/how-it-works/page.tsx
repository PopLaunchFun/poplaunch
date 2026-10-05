import Link from "next/link";
import { V1, fmtSol, fmtTokens } from "@/lib/launch";

const STEPS = [
  { n: "1", title: "Back it", text: "Pick a coin and commit SOL. It goes into a program-controlled escrow and stays locked until the launch succeeds or becomes refundable.", color: "bg-peach" },
  { n: "2", title: "Fill it", text: `Together, backers fill the balloon to the ${fmtSol(V1.targetLamports, 0)} SOL target within 24 hours.`, color: "bg-yellow" },
  { n: "3", title: "Pop. It’s live.", text: "One transaction opens the pool with all the SOL, burns the LP tokens and enables claims. Backers claim their tokens; anyone can trade.", color: "bg-[#bff0c6]" },
];

const FAQ: [string, string][] = [
  ["When is my SOL locked?", "The moment your backing confirms. It cannot be withdrawn while the launch is filling up or getting ready. It is released only as tokens (if the launch succeeds) or as a refund (if it does not)."],
  ["What do I get if it launches?", `Tokens, in proportion to your share of the target. Half of the supply (${fmtTokens(V1.backerAllocation, V1.decimals)} tokens) goes to backers; 1 SOL of a 50 SOL launch is 10,000,000 tokens. You do not get your SOL back: the SOL becomes the pool's liquidity.`],
  ["How do refunds work?", "If the target is not reached by the deadline, or settlement does not finish within 60 minutes of filling, every backer can reclaim their full SOL. Refunds never expire and go only to the wallet that backed. Network fees are not refunded."],
  ["Where does the liquidity go?", "All target SOL and the other half of the supply are deposited into a Raydium pool, and every LP token the pool issues is burned in the same transaction. Nobody, including Pop Launch or the creator, can withdraw that liquidity. Burning does not stop prices from falling or holders from selling."],
  ["Does the creator get tokens?", "No. Creators receive no allocation and no fee from backers. They pay a 0.1 SOL creation fee and a setup reserve for pool costs, and they can back their own coin on the same terms as everyone else."],
  ["What does it cost?", `Backers pay only network fees and the rent of their token account on claim. Creators pay the ${fmtSol(V1.creationFeeLamports)} SOL creation fee plus a quoted setup reserve; unused reserve is returned.`],
  ["What are the risks of trading?", "After launch the token trades on a public DEX. Prices move, fees apply, and a launch that fills does not promise profit or any minimum resale value. Backer counts mean wallets, which can be created at will."],
];

export default function HowItWorks() {
  return (
    <div className="mx-auto max-w-[1536px] px-4 md:px-[62px] pt-6 md:pt-10 pb-16">
      <h1 className="display text-[40px] md:text-[56px]">How it works</h1>
      <p className="font-bold text-[18px] mt-3 max-w-[52ch]">Anyone can make a coin. The crowd makes it pop.</p>
      <div className="box p-6 md:p-8 mt-8 grid md:grid-cols-3 gap-6 md:gap-8">
        {STEPS.map((s) => (
          <div key={s.n} className="flex gap-4">
            <div className={`shrink-0 w-11 h-11 rounded-full border-[3px] border-ink ${s.color} flex items-center justify-center display text-[18px]`} aria-hidden>{s.n}</div>
            <div><h2 className="display text-[22px]">{s.title}</h2><p className="text-[15px] text-muted mt-1">{s.text}</p></div>
          </div>
        ))}
      </div>
      <h2 className="display text-[32px] mt-12">Questions</h2>
      <div className="mt-4 space-y-3 max-w-[760px]">
        {FAQ.map(([q, a]) => (
          <details key={q} className="box p-5">
            <summary className="font-bold text-[17px]">{q}</summary>
            <p className="text-[15px] text-muted mt-2">{a}</p>
          </details>
        ))}
      </div>
      <p className="label mt-8">Ready? <Link href="/" className="link">Explore launches</Link> or <Link href="/create" className="link">launch a token</Link>.</p>
    </div>
  );
}
