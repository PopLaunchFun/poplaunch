import { LaunchForm } from "@/components/launch-form";
import { api } from "@/lib/api";
import { IS_MAINNET, NETWORK } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function Launch() {
  const status = await api.status();
  const bb = await api.buyback();
  return (
    <div className="pt-4 md:pt-6">
      <h1 className="text-[22px] md:text-[24px] font-semibold leading-tight">Launch a coin</h1>
      <p className="text-[14px] text-muted mt-1 max-w-[520px]">Fixed supply, all of it seed inventory, no creator allocation. You earn the 0.25% creator fee on every trade.</p>
      {IS_MAINNET ? (
        <div className="panel p-4 mt-6 text-[14px] text-neg">Mainnet launches are disabled until the release gates in docs/deployment.md pass.</div>
      ) : (
        <LaunchForm network={NETWORK} indexerOk={!!status} popMint={bb?.popMint ?? null} />
      )}
    </div>
  );
}
