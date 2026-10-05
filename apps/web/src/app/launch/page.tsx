import { LaunchForm } from "@/components/launch-form";
import { api } from "@/lib/api";
import { IS_MAINNET, NETWORK } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function Launch() {
  const pop = await api.pop();
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold">Launch a market</h1>
      <p className="text-sm text-paper-2 mt-2">Every launched coin uses the same rules as POP: a fixed-supply mint created by the factory, 100% of supply committed as seed inventory, zero creator allocation, the same fees, and the same graduation thresholds. You may buy through the ordinary market like anyone else.</p>
      {IS_MAINNET ? (
        <div className="panel p-4 mt-6 text-sm text-scar">Mainnet launches are disabled until the release gates in docs/deployment.md pass.</div>
      ) : (
        <LaunchForm network={NETWORK} settings={pop?.protocol.settings ?? null} launchesEnabled={pop?.protocol.launchesEnabled ?? false} />
      )}
    </div>
  );
}
