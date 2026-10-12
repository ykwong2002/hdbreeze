import { ICON } from "./icons";

/** Title screen: name, pitch, non-affiliation line, Start, Why this game, How to play. */
export function showTitle(root: HTMLElement, onStart: () => void, onWhy: () => void): { unmount(): void } {
  const el = document.createElement("section");
  el.className = "title";
  el.innerHTML = `
    <div class="title-box">
      <h1>HDBreeze <span class="title-wind"></span></h1>
      <p class="title-pitch">Plan a liveable HDB precinct: house thousands of people on a real plot and keep the streets breathable in Singapore's heat.</p>
      <p class="title-legal">Fan-made educational toy, not real CFD. Not affiliated with or endorsed by HDB or URA.</p>
      <button class="btn btn-primary title-start">Start</button>
      <div class="title-row"><button class="btn title-why">Why this game</button><button class="btn title-howto">How to play</button></div>
    </div>`;
  root.append(el);
  el.querySelector<HTMLButtonElement>(".title-start")!.onclick = () => { el.remove(); onStart(); };
  el.querySelector<HTMLButtonElement>(".title-why")!.onclick = onWhy;
  el.querySelector<HTMLButtonElement>(".title-howto")!.onclick = () => showHowTo(root);
  return { unmount: () => el.remove() };
}

const WHY = [
  { ico: ICON.sun, h: "Singapore is hot", p: "<strong>A light breeze feels one to two degrees cooler.</strong> Where blocks stand in its way, the streets between them turn <em>stuffy</em>." },
  { ico: ICON.city, h: "Planners think about wind first", p: "<strong>Every plot must house a set number of people.</strong> The craft is fitting them in and <em>still letting the air through</em>." },
  { ico: ICON.wind, h: "Your job", p: "<strong>Place every block. House everyone. Keep the walkways breathable.</strong> Rows along the wind, gaps between them, void decks. <em>Estimates, for fun and education.</em>" },
];

/** Three "why this game" panels, shown on first start and from the title. */
export function showWhy(root: HTMLElement, onDone: () => void): { unmount(): void } {
  const el = document.createElement("section");
  el.className = "howto why";
  let i = 0;
  const render = (): void => {
    const w = WHY[i]!;
    el.innerHTML = `
      <div class="howto-box">
        <div class="why-ico">${w.ico}</div>
        <h2>${w.h}</h2>
        <p class="why-p">${w.p}</p>
        <div class="why-dots">${WHY.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>
        <div class="endcard-btns"><button class="btn btn-primary why-next">${i < WHY.length - 1 ? "Next" : "Let's build"}</button>${i < WHY.length - 1 ? '<button class="btn btn-link why-skip">skip</button>' : ""}</div>
      </div>`;
    el.querySelector<HTMLButtonElement>(".why-next")!.onclick = () => { if (i < WHY.length - 1) { i++; render(); } else { el.remove(); onDone(); } };
    el.querySelector<HTMLButtonElement>(".why-skip")?.addEventListener("click", () => { el.remove(); onDone(); });
  };
  render();
  root.append(el);
  return { unmount: () => el.remove() };
}

/** How-to card, also reachable from the "?" chip in a level. */
export function showHowTo(root: HTMLElement): { unmount(): void } {
  const el = document.createElement("section");
  el.className = "howto";
  el.innerHTML = `
    <div class="howto-box">
      <h2>How to play</h2>
      <ol>
        <li><span class="howto-ico">${ICON.target}</span><span><strong>Clear a plot:</strong> place every block in the tray, house the target, and keep the precinct breathable (the big number) above the line for a few seconds.</span></li>
        <li><span class="howto-ico">${ICON.hand}</span><span><strong>Drag</strong> a block from the tray onto the plot, drag it again to move. <strong>Twist two fingers</strong> to turn it. <strong>Tap</strong> it for height, void deck and remove.</span></li>
        <li><span class="howto-ico">${ICON.fingers2}</span><span><strong>Two fingers</strong> drag the map, pinch to zoom and twist to look around. <strong>Three-finger tap</strong> tilts the view.</span></li>
        <li><span class="howto-ico">${ICON.wind}</span><span><strong>The arrow is the wind.</strong> Rows along it and gaps between them are corridors; walls across it make stuffy pockets. Blue is breezy, red is stuffy.</span></li>
        <li><span class="howto-ico">${ICON.cloud}</span><span><strong>Two monsoons.</strong> NE (Dec–Mar) and SW (Jun–Sep) blow from opposite sides. Tap the monsoon chip to switch; some plots must pass both.</span></li>
      </ol>
      <p class="howto-tip">Breathability is measured on your device: 0% is the careless plan you saw at the start, 100% is the empty plot.</p>
      <div class="endcard-btns"><button class="btn btn-primary howto-ok">Got it</button><button class="btn btn-link howto-about">about & sources</button></div>
    </div>`;
  root.append(el);
  const close = (): void => el.remove();
  el.querySelector<HTMLButtonElement>(".howto-ok")!.onclick = close;
  el.querySelector<HTMLButtonElement>(".howto-about")!.onclick = () => { close(); showAbout(root); };
  el.onclick = (e) => { if (e.target === el) close(); };
  return { unmount: close };
}

export function showAbout(root: HTMLElement): { unmount(): void } {
  const el = document.createElement("section");
  el.className = "howto";
  el.innerHTML = `
    <div class="howto-box about">
      <h2>About</h2>
      <p>HDBreeze is a fan-made educational toy. The wind is a 2D lattice-Boltzmann flow at ground level with a simple heat model, not real CFD: it shows the shape of the problem, not the numbers a planner would use.</p>
      <p><strong>Data:</strong> HDB block footprints and storeys (HDB Existing Building, HDB Property Information) and Master Plan land use and plot ratios (URA) via data.gov.sg under the Singapore Open Data Licence; other buildings and footpaths © OpenStreetMap contributors; basemap OpenFreeMap / OpenMapTiles.</p>
      <p><strong>Residents' lines</strong> come from a 0.8-million-parameter character model trained for this game on a small Singlish corpus; it runs in your browser.</p>
      <p>Everything here is an estimate, for fun and educational value. Not affiliated with or endorsed by HDB or URA.</p>
      <div class="endcard-btns"><button class="btn btn-primary howto-ok">Close</button></div>
    </div>`;
  root.append(el);
  const close = (): void => el.remove();
  el.querySelector<HTMLButtonElement>(".howto-ok")!.onclick = close;
  el.onclick = (e) => { if (e.target === el) close(); };
  return { unmount: close };
}
