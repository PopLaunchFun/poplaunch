import Link from "next/link";

export default function Mechanism() {
  return (
    <div className="max-w-3xl prose-pop pt-4 md:pt-6">
      <h1 className="text-[22px] md:text-[24px] font-semibold leading-tight">How it works</h1>
      <p><strong className="text-text">Short version.</strong> Every trade pays a 2% fee. Buy fees arrive in SOL, sell fees in the coin. At each price bin the two kinds pair up at that bin&apos;s fixed price and become locked liquidity that stays exactly there. Nobody can withdraw it; it only changes hands through ordinary trades.</p>
      <p>Each coin launched here is a discrete constant-price-bin market. Price moves in 1% steps between fixed bins. Each bin holds inventory of two kinds: launch seed inventory and fee-funded scar inventory. The bin never moves; what changes is what it holds.</p>

      <h2>Prices</h2>
      <p>Bin <code>i</code> executes at <code>P_i = P0 × 1.01^i</code>. <code>P0</code> is an initialization convention equal to the creator&apos;s seed SOL divided by the 1B token supply. It is not a valuation and does not mean the seed collateralizes the supply. Prices are computed with checked fixed-point integers (Q64.64) by binary exponentiation; the documented relative error against the exact real value is below 2.1e-9 and the client and program compute identical integers.</p>

      <h2>Fees</h2>
      <table>
        <thead><tr><th>Destination</th><th>Share of gross input</th></tr></thead>
        <tbody>
          <tr><td>Scar escrow for the bins the trade crossed</td><td>150 bps</td></tr>
          <tr><td>Protocol revenue</td><td>25 bps</td></tr>
          <tr><td>Creator revenue</td><td>25 bps</td></tr>
          <tr><td>Total</td><td>200 bps (2.00%)</td></tr>
        </tbody>
      </table>
      <p>Buy input is wrapped SOL; sell input is the coin. Each fee is <code>floor(input × bps / 10000)</code>. The scar fee is split across the visited bins in proportion to the input executed in each (largest-remainder, ties to the lower bin id). Half of the protocol&apos;s SOL fee from every coin is earmarked for the POP buyback escrow (see Status). Quotes shown in the trade ticket are after fees; slippage tolerance applies to the after-fee output.</p>

      <h2>Swaps</h2>
      <p>Only exact-input, fill-or-kill swaps exist. A buy starts at the cursor bin, consumes token inventory and moves upward; a sell consumes SOL inventory and moves downward. At most 32 bins are inspected, empty ones included; if the input is not filled within that limit the whole swap reverts. Output is floored; when a bin is fully consumed the input required is <code>ceil(inventory × price)</code>. A bounded rounding surplus (less than the price of one output unit) stays in the final bin.</p>
      <p>Seed and scar inventory in a bin trade at the same price. Consumption and incoming asset are split in proportion to each class&apos;s available output inventory; the residual goes to seed (to scar if seed is empty).</p>

      <h2>Matching</h2>
      <p>After a swap, at every bin it visited, pending buy fees (SOL) and pending sell fees (token) are matched: choose the largest <code>b ≤ B</code> such that <code>q = ceil(b × P_i) ≤ Q</code>, move <code>b</code> and <code>q</code> into activated scar inventory, and add <code>q</code> to the bin&apos;s and its band&apos;s lifetime paired counter. Scars formed by a swap are only tradable by later transactions. Fees with no opposing flow wait indefinitely; there is no refund or admin sweep. Only recorded swap fees qualify.</p>
      <p>Example: at 0.000001 SOL/token with 0.46 SOL of pending buy fees and 315,000 tokens of pending sell fees, 315,000 tokens pair with 0.315 SOL; 0.145 SOL stays pending. The paired amount is 0.315 SOL, not 0.46.</p>

      <h2>Graduation</h2>
      <p><code>progress = min(1, paired_quote_lifetime / 100 SOL, hardened_bands / 10)</code>, where a band of 10 bins is hardened once its lifetime paired quote reaches 1 SOL. Both thresholds are required. Graduation is an irreversible status flag that changes nothing about reserves, prices, fees or trading. It is a milestone of fees paid on both sides, achievable by a single actor round-tripping, and must not be read as proof of demand or as a floor.</p>

      <h2>Three different numbers</h2>
      <ul>
        <li><strong>Historical paired quote</strong>: cumulative fees activated by matching. Monotonic.</li>
        <li><strong>Current scar inventory</strong>: what the bins hold right now. Changes with every swap.</li>
        <li><strong>Executable depth</strong>: what a swap could actually get within 5/10/20% of the cursor price, from current inventory only.</li>
      </ul>

      <h2>Limits and risks</h2>
      <ul>
        <li>When bid inventory is exhausted, sells revert. There is no floor, no redemption, no rescue minting.</li>
        <li>When token inventory is exhausted at the top bin, buys revert.</li>
        <li>Large buys span many bins: with a 1 SOL seed a single buy above ~0.075 SOL exceeds the traversal cap (about 1.5 SOL with a 20 SOL seed) and must be split into separately signed transactions. The launch form shows the limit for the chosen seed.</li>
        <li>Price pages are created lazily: a trade whose route enters a new page creates it in the same transaction and the trader pays its rent (shown in the ticket).</li>
        <li>External venues can trade the token without paying these fees; only trades through this program build scars.</li>
        <li>Authority: the program is upgradeable until its upgrade authority is revoked. See <Link className="link" href="/status">status</Link> for the current authority.</li>
      </ul>
      <p>Full details: <code>docs/mechanism.md</code>, <code>docs/economic-findings.md</code> and the executable specification in <code>packages/math</code>.</p>
    </div>
  );
}
