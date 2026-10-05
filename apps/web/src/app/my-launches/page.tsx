import { MyLaunches } from "@/components/my-launches";

export default function MyLaunchesPage() {
  return (
    <div className="pt-4 md:pt-6">
      <h1 className="text-[22px] md:text-[24px] font-semibold leading-tight">My launches</h1>
      <p className="text-[14px] text-muted mt-1">Coins created by the connected wallet, with activation status and creator fee claims.</p>
      <MyLaunches />
    </div>
  );
}
