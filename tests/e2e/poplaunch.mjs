/**
 * End-to-end run of the connected app on localnet, through the real UI with the Dev wallet:
 *   wallet A creates a coin (image upload, signed draft, create_launch), backs it;
 *   wallet B backs the remainder → READY → keeper settles → LIVE → B claims;
 *   wallet A creates a second coin, backs a little, waits for the funding deadline → reclaims.
 * Run: node tests/e2e/poplaunch.mjs   (needs localnet, launchd and the web app on :3100 in localnet mode)
 */
import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";

const base = process.env.POP_WEB_URL ?? "http://127.0.0.1:3100";
const api = process.env.POP_API_URL ?? "http://127.0.0.1:8788";
const out = new URL("../../apps/poplaunch/screenshots/e2e/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const errors = [];
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newWallet(name) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${name} console: ${m.text().slice(0, 200)}`); });
  await page.goto(base + "/", { waitUntil: "load" });
  await page.getByRole("button", { name: /connect wallet/i }).click();
  await page.getByRole("menuitem", { name: /dev wallet/i }).click();
  await page.getByRole("button", { name: /^Wallet / }).waitFor({ timeout: 15000 });
  const addr = (await page.getByRole("button", { name: /^Wallet / }).getAttribute("aria-label")).replace("Wallet ", "");
  // fund it
  await page.getByRole("button", { name: /^Wallet / }).click();
  await page.getByRole("menuitem", { name: /airdrop/i }).click();
  await sleep(1500);
  await page.keyboard.press("Escape");
  log(`${name} = ${addr}`);
  return { ctx, page, addr, name };
}
async function shot(page, name) {
  await page.screenshot({ path: `${out}${name}.png`, fullPage: true });
}
async function waitForText(page, text, timeout = 60000) {
  try {
    await page.getByText(text, { exact: false }).first().waitFor({ timeout });
  } catch (e) {
    await page.screenshot({ path: `${out}FAIL-${text.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.png`, fullPage: true });
    console.log("page text at failure:", (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 1500));
    throw e;
  }
}
/** Amount → review step → confirm → success. */
async function back(page, amount) {
  await page.getByRole("textbox", { name: "Amount in SOL" }).fill(amount);
  await page.getByRole("button", { name: new RegExp(`^Back with ${amount.replace(".", "\\.")} SOL`) }).click();
  await waitForText(page, "You commit", 15000);
  await page.getByRole("button", { name: new RegExp(`^Back with ${amount.replace(".", "\\.")} SOL`) }).click();
  // The final contribution flips the launch to READY and the keeper may settle it within seconds, so the
  // page can legitimately move past the success card before we look at it.
  await Promise.any([
    page.getByText("You’re in. Let’s make it pop.").first().waitFor({ timeout: 90000 }),
    page.getByText("Filled! Getting your launch ready.").first().waitFor({ timeout: 90000 }),
    page.getByText("is live.").first().waitFor({ timeout: 90000 }),
  ]).catch(async () => { await waitForText(page, "You’re in. Let’s make it pop.", 1000); });
}

const A = await newWallet("A");
const B = await newWallet("B");

// ---------------------------------------------------------------- create a coin (A)
await A.page.goto(base + "/create", { waitUntil: "load" });
await A.page.getByPlaceholder("CAT.EXE").fill("E2E Cat");
await A.page.getByPlaceholder("CATEXE").fill("E2ECAT");
await A.page.locator('input[type="file"]').setInputFiles(new URL("../../apps/poplaunch/public/art/face-cat.png", import.meta.url).pathname);
await A.page.getByRole("textbox", { name: /short description/i }).fill("An end-to-end test coin. Not a real project.");
await A.page.getByRole("button", { name: "Preview launch" }).click();
await waitForText(A.page, "What you pay");
await shot(A.page, "01-create-preview");
await A.page.getByRole("button", { name: "Publish launch" }).click();
await A.page.waitForURL(/\/launch\/[1-9A-HJ-NP-Za-km-z]{32,44}/, { timeout: 90000 });
const mint = A.page.url().split("/launch/")[1].split("?")[0];
log("created launch mint", mint);
await waitForText(A.page, "Help it pop");
await shot(A.page, "02-launch-created");

// ---------------------------------------------------------------- A backs 1.5 SOL
await back(A.page, "1.5");
await shot(A.page, "03-backed-A");

// ---------------------------------------------------------------- B backs the rest (0.5 SOL) → READY
await B.page.goto(`${base}/launch/${mint}`, { waitUntil: "load" });
await waitForText(B.page, "Help it pop");
await back(B.page, "0.5");
await shot(B.page, "04-backed-B-filled");

// ---------------------------------------------------------------- keeper settles → LIVE
await waitForText(B.page, "is live.", 120000);
await sleep(2000);
await shot(B.page, "05-live");
const live = await (await fetch(`${api}/api/launches/${mint}`)).json();
log("settlement", JSON.stringify({ state: live.launch.state, pool: live.launch.poolState, lpBurned: live.launch.lpBurned, attempts: live.launch.settlementAttempts.map((a) => [a.status, a.signature]) }));

// ---------------------------------------------------------------- B claims
await B.page.getByRole("button", { name: /^Claim / }).click();
await waitForText(B.page, "Claimed. Tokens are in your wallet.", 90000);
await shot(B.page, "06-claimed-B");
const posB = await (await fetch(`${api}/api/wallets/${B.addr}/launches`)).json();
log("B receipt", JSON.stringify(posB.entries.map((e) => [e.launch.symbol, e.receipt, e.action])));

// ---------------------------------------------------------------- A: my pops
await A.page.goto(base + "/my-pops", { waitUntil: "load" });
await waitForText(A.page, "Claimable");
await A.page.getByRole("tab", { name: /Claimable/ }).click();
await sleep(1000);
await shot(A.page, "07-my-pops-A");

// ---------------------------------------------------------------- refund path: second coin, under-funded
await A.page.goto(base + "/create", { waitUntil: "load" });
await A.page.getByPlaceholder("CAT.EXE").fill("E2E Frog");
await A.page.getByPlaceholder("CATEXE").fill("E2EFROG");
await A.page.locator('input[type="file"]').setInputFiles(new URL("../../apps/poplaunch/public/art/face-frog.png", import.meta.url).pathname);
await A.page.getByRole("button", { name: "Preview launch" }).click();
await A.page.getByRole("button", { name: "Publish launch" }).click();
await A.page.waitForURL(/\/launch\/[1-9A-HJ-NP-Za-km-z]{32,44}/, { timeout: 90000 });
const mint2 = A.page.url().split("/launch/")[1].split("?")[0];
await waitForText(A.page, "Help it pop");
await back(A.page, "0.1");
let l2 = null;
for (let i = 0; i < 20 && !l2?.launch; i++) { l2 = await (await fetch(`${api}/api/launches/${mint2}`)).json(); if (!l2?.launch) await sleep(1000); }
const waitMs = l2.launch.fundingDeadline * 1000 - Date.now() + 3000;
log(`waiting ${Math.round(waitMs / 1000)}s for the funding deadline of ${mint2}`);
await sleep(Math.max(0, waitMs));
await A.page.reload({ waitUntil: "load" });
await waitForText(A.page, "didn’t launch", 60000);
await shot(A.page, "08-refundable");
await A.page.getByRole("button", { name: /^Reclaim / }).click();
await waitForText(A.page, "Reclaimed. SOL is back in your wallet.", 90000);
await shot(A.page, "09-refunded");

// ---------------------------------------------------------------- home with live data, mobile too
await A.page.goto(base + "/", { waitUntil: "load" });
await sleep(1500);
await shot(A.page, "10-home-live");
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mp = await m.newPage();
await mp.goto(`${base}/launch/${mint}`, { waitUntil: "load" });
await sleep(1500);
await mp.screenshot({ path: `${out}11-live-mobile.png`, fullPage: true });
await m.close();

await browser.close();
console.log("errors:", errors.length ? errors.join("\n") : "none");
console.log(JSON.stringify({ mint, mint2, walletA: A.addr, walletB: B.addr }));
