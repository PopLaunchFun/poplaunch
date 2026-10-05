import Link from "next/link";

export const metadata = { title: "Terms of use — Pop Launch" };

const S = ({ t, children }: { t: string; children: React.ReactNode }) => (
  <section className="mt-8"><h2 className="display text-[22px]">{t}</h2><div className="mt-2 space-y-3 text-muted">{children}</div></section>
);

/** Terms of use. Plain language, written to be read. Reviewed by counsel (owner confirmation, October 2026). */
export default function Terms() {
  return (
    <div className="mx-auto max-w-[760px] px-4 md:px-8 pt-6 md:pt-10 pb-16 text-[16px]">
      <h1 className="display text-[40px]">Terms of use</h1>
      <p className="label mt-2">Last updated October 2026.</p>
      <p className="mt-6 text-muted">These terms apply to the Pop Launch website and app (the interface). By using the interface you agree to them. If you do not agree, do not use it.</p>

      <S t="1. What Pop Launch is">
        <p>Pop Launch is an interface to a public program on the Solana blockchain. The program lets anyone open a token launch with fixed terms, lets backers commit SOL to it, and, if the target is reached, creates a trading pool and distributes tokens. If the target is not reached, backers reclaim their SOL.</p>
        <p>Pop Launch, the operator, provides the interface, a metadata and image service, a public index of launches, and a keeper that submits the public settlement instruction. The operator never holds backer SOL or launch tokens and cannot cancel, extend, change or settle a launch on its own authority. <Link href="/authority" className="link">Who controls what</Link> lists every key and its powers.</p>
      </S>
      <S t="2. Not an exchange, broker or adviser">
        <p>Pop Launch does not sell tokens, give investment advice, or act as a broker, exchange, custodian or payment service. Launched tokens trade on third-party venues that Pop Launch does not operate or control.</p>
      </S>
      <S t="3. Backing a launch">
        <p>When you back a launch, your SOL moves into a program-controlled escrow and is locked until the launch either succeeds or becomes refundable. You cannot withdraw it while the launch is filling up or getting ready. This is shown to you before you sign.</p>
        <p>If the launch succeeds, you receive a token allocation in proportion to your share of the target. You do not get your SOL back: it becomes the pool's liquidity. If the launch does not succeed, you can reclaim your full SOL at any time; refunds never expire. Network fees and account rent are paid by you and are never refunded.</p>
        <p>A contribution larger than the remaining target is rejected whole. Two transactions racing for the last space may both pay a network fee while only one succeeds.</p>
      </S>
      <S t="4. Creating a launch">
        <p>Creators choose a name, ticker, image, description and links. The launch terms (target, window, supply, allocations, fees) are the same for every coin and cannot be changed. Creators receive no token allocation and no fee from backers. Creators pay a creation fee, charged only when the launch is created on chain, and a setup reserve for pool costs; unused reserve is returned.</p>
        <p>You are responsible for the content you upload. Do not upload content you do not have the right to use, content that impersonates a person or organization, or content that is illegal where you or your backers are. Pop Launch may remove such content from its own servers; the on-chain launch itself cannot be removed by anyone.</p>
      </S>
      <S t="5. No promises about value">
        <p>A launch that fills does not promise profit, liquidity depth, a minimum resale value, or that anyone will trade the token. Prices can fall to zero. Backer counts are wallet counts and can be manufactured. Burned LP tokens stop anyone from withdrawing the pool's assets; they do not stop prices from falling or holders from selling.</p>
      </S>
      <S t="6. Risks you accept">
        <p>Blockchain transactions are irreversible. Software has bugs; the program has been reviewed but the operator does not promise it is free of defects. Third-party programs (the Solana network, Raydium, wallet software) can change, pause or fail. The program can be upgraded by its upgrade authority as described on the <Link href="/authority" className="link">authority page</Link>. You use the interface at your own risk and only with funds you can afford to lose.</p>
      </S>
      <S t="7. Eligibility and lawful use">
        <p>You must be legally able to enter these terms where you live, and you must not use the interface where doing so is unlawful, or if you are subject to sanctions that prohibit it. You are responsible for your own taxes and reporting.</p>
      </S>
      <S t="8. The interface">
        <p>The interface is provided as is, without warranties of any kind. The operator may change, suspend or stop the interface at any time. Because the program is public, claims and refunds remain available through any compatible software even if the interface is down.</p>
      </S>
      <S t="9. Liability">
        <p>To the extent the law allows, the operator is not liable for any loss arising from your use of the interface or the program, including loss of funds, loss of access, price movements, or the acts of third parties. Where liability cannot be excluded, it is limited to the fees you paid to the operator in the preceding twelve months.</p>
      </S>
      <S t="10. Changes">
        <p>These terms may change. The date at the top shows the current version. Continued use after a change means you accept it. Changes never alter the on-chain terms of a launch that already exists.</p>
      </S>
      <S t="11. Contact">
        <p>Questions about these terms: <a className="link" href="mailto:hello@poplaunch.fun">hello@poplaunch.fun</a>.</p>
      </S>
    </div>
  );
}
