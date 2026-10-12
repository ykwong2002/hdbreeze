// Records the walkthrough from a real, visible Chrome window (GPU rendering) via the tab screencast.
import puppeteer from "/private/tmp/claude-501/-Users-yeowkang-hdbreeze/952c467d-7cf6-42f9-87c5-ab291653d704/scratchpad/m0/tools/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
const [base, out] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: false, defaultViewport: null, args: ["--window-size=430,960", "--window-position=40,40", "--autoplay-policy=no-user-gesture-required", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check"] });
const page = (await browser.pages())[0] ?? (await browser.newPage());
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = []; page.on("pageerror", (e) => errs.push(e.message));
await page.goto(base, { waitUntil: "load", timeout: 90000 });
await sleep(3000);
const rec = await page.screencast({ path: `${out}/walkthrough.webm` });
// 1. title + tour, then into the town list
await sleep(8000);
await page.click(".title-start"); await sleep(600);
for (let i = 0; i < 3; i++) { await page.click(".why-next").catch(() => {}); await sleep(500); }
await sleep(3000);
await page.click(".town"); await page.waitForSelector(".townview", { timeout: 30000 }); await sleep(3500);
// 2. demo autoplay
await page.goto(`${base}?demo=1&level=punggol-p1`, { waitUntil: "load", timeout: 90000 });
const end = await page.waitForSelector(".endcard", { timeout: 240000 }).then(() => true).catch(() => false);
await sleep(4500);
await rec.stop();
console.log("endcard", end, errs.length ? "errors: " + errs.slice(0, 3).join(" | ") : "no errors");
await browser.close();
