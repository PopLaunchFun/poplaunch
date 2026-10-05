export default function Terms() {
  return (
    <div className="mx-auto max-w-[760px] px-4 md:px-8 pt-6 md:pt-10 pb-16 text-[16px]">
      <h1 className="display text-[40px]">Terms of use</h1>
      <p className="tag tag-yellow mt-3">Draft. Not yet reviewed by counsel. Replace before any public release.</p>
      <div className="mt-6 space-y-4 text-muted">
        <p>Pop Launch is an interface to a public Solana program. Backing a launch sends SOL to a program-controlled escrow; the program, not Pop Launch, decides whether that SOL becomes pool liquidity or is refunded. Pop Launch holds no user funds and cannot cancel, extend or alter a published launch.</p>
        <p>A successful launch delivers a token allocation, not a return of SOL, and promises no profit or minimum resale value. Tokens trade on third-party venues outside Pop Launch. Network fees and account rent are paid by users and are not refunded.</p>
        <p>Creators are responsible for the content they upload. Pop Launch may remove metadata that is illegal or abusive from its servers; the on-chain launch itself cannot be removed.</p>
        <p>The software is experimental and provided as is. Use it only with funds you can afford to lose, and only where doing so is lawful for you.</p>
      </div>
    </div>
  );
}
