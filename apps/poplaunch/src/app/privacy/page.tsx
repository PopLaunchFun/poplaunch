export const metadata = { title: "Privacy — Pop Launch" };

const S = ({ t, children }: { t: string; children: React.ReactNode }) => (
  <section className="mt-8"><h2 className="display text-[22px]">{t}</h2><div className="mt-2 space-y-3 text-muted">{children}</div></section>
);

/** Privacy notice. Counsel review is a mainnet gate (docs/deployment-poplaunch.md). */
export default function Privacy() {
  return (
    <div className="mx-auto max-w-[760px] px-4 md:px-8 pt-6 md:pt-10 pb-16 text-[16px]">
      <h1 className="display text-[40px]">Privacy</h1>
      <p className="label mt-2">Last updated October 2026. <span className="tag tag-yellow ml-1">Pending counsel review before mainnet</span></p>
      <p className="mt-6 text-muted">Pop Launch collects as little as it can. Here is exactly what is stored, where, and why.</p>

      <S t="What is public by design">
        <p>Everything on the Solana blockchain is public: wallet addresses, transactions, backing amounts, claims and refunds. Pop Launch keeps a cache of this public data to build the launch feed and your My pops page. It does not create new personal data from it.</p>
        <p>The name, ticker, image, description and links a creator uploads are public, together with the wallet address that signed the upload. They are served to anyone who opens the launch page and are referenced from the token's on-chain metadata.</p>
      </S>
      <S t="What the server stores">
        <ul className="list-disc pl-5 space-y-1">
          <li>Uploaded images and launch metadata, keyed by the coin's mint address.</li>
          <li>Unpublished drafts for up to 48 hours, then deleted.</li>
          <li>A cache of on-chain launches, receipts and events.</li>
          <li>Request logs with IP addresses, kept for abuse prevention and rate limiting for up to 30 days.</li>
          <li>Used upload signatures for one hour, to prevent replay.</li>
        </ul>
        <p>No email addresses, names, accounts or passwords are collected. There is no sign-up.</p>
      </S>
      <S t="What stays in your browser">
        <p>A pending draft while you publish a coin, so a failed transaction can be retried without re-uploading. On local test builds only, a throwaway development wallet. Nothing in the browser is sent to analytics services; Pop Launch runs no analytics or advertising trackers.</p>
      </S>
      <S t="Wallets">
        <p>Your wallet software (for example Phantom or Solflare) handles your keys. Pop Launch never sees or stores a private key. Connecting a wallet shares only its public address with the interface.</p>
      </S>
      <S t="Third parties">
        <p>Reading and sending transactions goes through a Solana RPC provider, which sees your IP address and the transactions you send, as any website using the blockchain does. Trading links open Raydium's site, which has its own privacy notice.</p>
      </S>
      <S t="Your choices">
        <p>You can use the interface without connecting a wallet. You can ask for an uploaded image or description to be removed from Pop Launch's servers; the on-chain record, including the metadata hash, cannot be removed by anyone. Contact details will be published on this page before mainnet.</p>
      </S>
    </div>
  );
}
