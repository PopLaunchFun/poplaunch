const STEPS = [
  { n: "1", title: "Back it", text: "Pick a coin and commit SOL. It stays locked until the launch succeeds or becomes refundable.", color: "bg-peach" },
  { n: "2", title: "Fill it", text: "Together, backers fill the balloon to the launch target.", color: "bg-yellow" },
  { n: "3", title: "Pop. It’s live.", text: "The pool opens and backers claim their tokens. If it never launches, reclaim your SOL.", color: "bg-lilac" },
];

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-[1200px] px-4 md:px-8 py-10 md:py-16 scroll-mt-24">
      <div className="card p-6 md:p-8 grid md:grid-cols-3 gap-6 md:gap-8">
        {STEPS.map((s, i) => (
          <div key={s.n} className="flex gap-4">
            <div className={`shrink-0 w-11 h-11 rounded-full ${s.color} flex items-center justify-center display text-[18px]`} aria-hidden>{s.n}</div>
            <div>
              <h3 className="display-md text-[20px]">{s.title}{i < 2 && <span className="text-muted hidden md:inline"> →</span>}</h3>
              <p className="text-[15px] text-muted mt-1 max-w-[30ch]">{s.text}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="label mt-4">Success means a token allocation, not tokens plus your SOL back: the SOL funds the trading pool. Network fees and account creation costs are not refunded.</p>
    </section>
  );
}
