import { MyLaunches } from "@/components/my-launches";

export default function MyLaunchesPage() {
  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold tracking-tight">My launches</h1>
      <p className="text-sm text-muted mt-1">Coins created by the connected wallet: activation status, missing price pages, claimable creator fees, and resume for unfinished launches.</p>
      <MyLaunches />
    </div>
  );
}
