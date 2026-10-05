import { MyPops } from "@/components/my-pops";

export default function MyPopsPage() {
  return (
    <div className="mx-auto max-w-[1536px] px-4 md:px-[62px] pt-6 md:pt-10 pb-16">
      <h1 className="display text-[40px] md:text-[56px]">My pops</h1>
      <p className="font-bold text-[18px] mt-3">Launches you backed or created, with the one thing to do for each.</p>
      <MyPops />
    </div>
  );
}
