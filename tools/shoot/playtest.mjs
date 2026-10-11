/**
 * Scripted play session for review: drives the game headlessly with simple commands and saves screenshots.
 *   node tools/shoot/playtest.mjs <baseUrl> <outDir> <command> ...
 * Commands:
 *   shot:<name>           screenshot now
 *   wait:<seconds>
 *   start                 tap Start on the title card
 *   howto                 open the how-to card
 *   close                 close any open card
 *   pick:<levelId>        choose a town from the picker
 *   tray:<type>           select a tray chip (slab, point, l, courtyard)
 *   tap:area:<n>          tap inside build area n (0-based)
 *   tap:block:<n>         tap placed block n
 *   tool:<rotate|height|void|move|remove>   press a toolbar button
 *   season                toggle the monsoon chip
 *   fill[:naive]          place the whole tray automatically (reference: spread, along the wind, void decks; naive: across, high)
 *   state                 print score, homes, blocks, hint and bubble text
 * Needs the locally installed Chrome; puppeteer-core is a dev dependency.
 */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const [base, outDir, ...cmds] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--hide-scrollbars"],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
// dev mode exposes the map and session handles the commands use
const url = base.includes("?") ? `${base}&harness=1` : `${base}?harness=1`;
await page.goto(url, { waitUntil: "load", timeout: 90000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(2500);
const tapEl = async (sel) => { const el = await page.$(sel); if (!el) return false; const b = await el.boundingBox(); if (!b) return false; await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); return true; };
const session = () => page.waitForFunction(() => window.__session && window.__session.agents, { timeout: 120000, polling: 250 });
const projectArea = (n) => page.evaluate((n) => { const s = window.__session; const a = s.level.areas[n]; const r = a.polygon; const c = [r.reduce((q, p) => q + p[0], 0) / r.length, r.reduce((q, p) => q + p[1], 0) / r.length]; const px = window.__hdb.map.project(c); return { x: px.x, y: px.y }; }, n);
const projectBlock = (n) => page.evaluate((n) => { const s = window.__session; const b = s.blocks.blocks[n]; if (!b) return null; const px = window.__hdb.map.project(b.center); return { x: px.x, y: px.y }; }, n);
for (const cmd of cmds) {
  const [op, a, b] = cmd.split(":");
  try {
    if (op === "shot") await page.screenshot({ path: join(outDir, `${a}.png`) });
    else if (op === "wait") await wait(Number(a) * 1000);
    else if (op === "start") await tapEl(".title-start");
    else if (op === "howto") { (await tapEl(".title-howto")) || (await tapEl(".hud .chip:last-of-type")); }
    else if (op === "close") { (await tapEl(".howto-ok")) || (await tapEl(".endcard .cont")); }
    else if (op === "pick") { const towns = await page.$$(".town"); for (const t of towns) { const txt = await t.evaluate((e) => e.textContent); if (txt.toLowerCase().includes(a.toLowerCase())) { const bb = await t.boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); } } await session(); await wait(4000); }
    else if (op === "tray") { const chips = await page.$$(".chip-tray"); for (const c of chips) { const txt = (await c.evaluate((e) => e.textContent)).toLowerCase(); if (txt.includes(a === "l" ? "l-block" : a)) { const bb = await c.boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); } } }
    else if (op === "tap" && a === "area") { const p = await projectArea(Number(b)); await page.touchscreen.tap(p.x, p.y); await wait(600); }
    else if (op === "tap" && a === "block") { const p = await projectBlock(Number(b)); if (p) { await page.touchscreen.tap(p.x, p.y); await wait(600); } }
    else if (op === "tool") { await tapEl(`.toolbar .${a}`); await wait(400); }
    else if (op === "season") { await tapEl(".chip-wind"); await wait(500); }
    else if (op === "fill") { await page.evaluate((style) => window.__fill(style), a === "naive" ? "naive" : "reference"); await wait(1000); }
    else if (op === "state") { const st = await page.evaluate(() => { const s = window.__session; if (!s) return { note: "no level open" }; return { score: Math.round(s.scoring.state.satisfaction), homes: s.scoring.state.homes, target: s.level.targets.homes, threshold: s.level.targets.satisfaction, blocks: s.blocks.blocks.map((b) => `${b.type} ${b.height} ${b.rotDeg}deg${b.voidDeck ? " void" : ""}`), placed: `${s.blocks.blocks.length}/${s.blocks.total()}`, season: s.season.label, cleared: s.scoring.state.cleared, hint: document.querySelector(".tray-hint")?.textContent, bubble: document.querySelector(".bubble")?.hidden ? null : document.querySelector(".bubble")?.textContent, hintBox: document.querySelector(".hint:not([hidden])")?.textContent ?? null }; }); console.log("state:", JSON.stringify(st)); }
    else console.log("unknown command", cmd);
  } catch (e) {
    console.log(`command ${cmd} failed: ${e.message}`);
  }
}
if (errors.length) console.log("page errors:", errors.slice(0, 5).join(" | "));
await browser.close();
