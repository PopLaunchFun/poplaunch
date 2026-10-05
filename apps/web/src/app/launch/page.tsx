import { LaunchForm } from "@/components/launch-form";
import { api } from "@/lib/api";
import { IS_MAINNET, NETWORK } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function Launch() {
  const status = await api.status();
  const bb = await api.buyback();
  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold tracking-tight">Launch a coin</h1>
      <p className="text-sm text-muted mt-1">Fixed supply, 100% committed to seed inventory, zero creator allocation. You earn the published 0.25% creator fee on every trade and can buy like anyone else.</p>
      {IS_MAINNET ? (
        <div className="panel p-4 mt-6 text-sm text-neg">Mainnet launches are disabled until the release gates in docs/deployment.md pass.</div>
      ) : (
        <LaunchForm network={NETWORK} indexerOk={!!status} popMint={bb?.popMint ?? null} />
      )}
    </div>
  );
}
