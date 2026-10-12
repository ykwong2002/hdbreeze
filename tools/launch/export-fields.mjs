// Runs the app's ?export=1 mode in a visible GPU-backed Chrome window and saves the fields for the teaser.
import puppeteer from "/private/tmp/claude-501/-Users-yeowkang-hdbreeze/952c467d-7cf6-42f9-87c5-ab291653d704/scratchpad/m0/tools/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
import { writeFileSync } from "node:fs";
const [base, level = "punggol-p1"] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: false, defaultViewport: null, args: ["--window-size=430,960", "--window-position=40,40", "--no-first-run", "--no-default-browser-check"] });
const page = (await browser.pages())[0] ?? (await browser.newPage());
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
page.on("console", (m) => { if (m.text().startsWith("[export]")) console.log(m.text()); });
await page.goto(`${base}?export=1&level=${level}`, { waitUntil: "load", timeout: 90000 });
await page.waitForFunction(() => window.__export, { timeout: 600000, polling: 1000 });
const data = await page.evaluate(() => window.__export);
for (const k of ["empty", "careless", "aligned"]) writeFileSync(`public/fields/${k}.json`, JSON.stringify({ meta: data.meta, ...data[k] }));
console.log("saved public/fields/{careless,aligned}.json", "breath", data.careless.breath, data.aligned.breath, "homes", data.aligned.homes);
await browser.close();
