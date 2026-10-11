// usage: node shoot.mjs <baseUrl> <outDir> name=query ...
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const [base, outDir, ...pairs] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--hide-scrollbars"],
});
for (const pair of pairs) {
  const i = pair.indexOf("="); const name = pair.slice(0, i); const query = pair.slice(i + 1);
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const logs = [];
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  page.on("requestfailed", (r) => logs.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`));
  const t0 = Date.now();
  await page.goto(`${base}?dev=1${query ? "&" + query : ""}`, { waitUntil: "load", timeout: 60000 });
  const ok = await page
    .waitForFunction(
      () => {
        const h = window.__hdb;
        return !!h && h.map.loaded() && h.map.areTilesLoaded();
      },
      { timeout: 60000, polling: 250 },
    )
    .then(() => true)
    .catch(() => false);
  await new Promise((r) => setTimeout(r, 800));
  const info = await page.evaluate(() => {
    const h = window.__hdb;
    if (!h) return null;
    const m = h.map;
    const c = m.getCenter();
    return {
      provider: h.provider(),
      center: [+c.lng.toFixed(4), +c.lat.toFixed(4)],
      zoom: +m.getZoom().toFixed(2),
      pitch: m.getPitch(),
      bearing: m.getBearing(),
      layers: m.getStyle().layers.length,
      buildings3d: m.queryRenderedFeatures({ layers: ["buildings-3d"] }).length,
      roads: m.queryRenderedFeatures({ layers: ["road"] }).length,
      water: m.queryRenderedFeatures({ layers: ["water"] }).length,
    };
  });
  await page.screenshot({ path: join(outDir, `${name}.png`) });
  console.log(JSON.stringify({ name, ok, ms: Date.now() - t0, info }));
  for (const l of logs.filter((l) => !l.startsWith("[log]")).slice(0, 12)) console.log("   ", l);
  await page.close();
}
await browser.close();
