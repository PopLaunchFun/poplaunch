export default function Privacy() {
  return (
    <div className="mx-auto max-w-[760px] px-4 md:px-8 pt-6 md:pt-10 pb-16 text-[16px]">
      <h1 className="display text-[40px]">Privacy</h1>
      <p className="tag tag-yellow mt-3">Draft. Not yet reviewed by counsel. Replace before any public release.</p>
      <div className="mt-6 space-y-4 text-muted">
        <p>Pop Launch stores the metadata creators upload (name, ticker, image, description, links) together with the wallet address that signed it, and keeps a cache of public on-chain activity (launches, backing receipts, claims, refunds). All of that is public by nature of the blockchain and of launch pages.</p>
        <p>The web app keeps small conveniences in your browser only: a pending draft while you publish, and on localnet builds a throwaway development wallet. Nothing is sent to analytics services.</p>
        <p>Server logs may record IP addresses for rate limiting and abuse prevention and are not kept longer than needed for that purpose.</p>
      </div>
    </div>
  );
}
