import { DEMO } from "@/lib/config";
import { CreateCoin } from "@/components/create-coin";

export default function CreatePage() {
  return (
    <div className="mx-auto max-w-[1536px] px-4 md:px-[62px] pt-6 md:pt-10 pb-16">
      <h1 className="display text-[40px] md:text-[56px]">Create a coin</h1>
      <p className="font-bold text-[18px] mt-3 max-w-[48ch]">Name it, add an image, publish. The crowd does the rest.</p>
      {DEMO ? (
        <div className="box p-6 mt-6 max-w-[560px]">
          <div className="font-bold">Creation is off in the demo preview.</div>
          <p className="label mt-1">Build the app for localnet or devnet to create launches with a connected wallet.</p>
        </div>
      ) : (
        <CreateCoin />
      )}
    </div>
  );
}
