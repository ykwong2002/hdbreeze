/** Title screen shown once per visit: name, pitch, non-affiliation line, Start. */
export function showTitle(root: HTMLElement, onStart: () => void): { unmount(): void } {
  const el = document.createElement("section");
  el.className = "title";
  el.innerHTML = `
    <div class="title-box">
      <h1>HDBreeze <span class="title-wind"></span></h1>
      <p class="title-pitch">Lay out HDB blocks so the breeze reaches the walkways. A toy about how layout shapes wind in Singapore towns.</p>
      <p class="title-legal">Fan-made toy, not real CFD. Not affiliated with or endorsed by HDB or URA.</p>
      <button class="btn btn-primary title-start">Start</button>
      <button class="btn title-howto">How to play</button>
    </div>`;
  root.append(el);
  el.querySelector<HTMLButtonElement>(".title-start")!.onclick = () => { el.remove(); onStart(); };
  el.querySelector<HTMLButtonElement>(".title-howto")!.onclick = () => showHowTo(root);
  return { unmount: () => el.remove() };
}

/** Three-step how-to card, also reachable from the "?" chip in a level. */
export function showHowTo(root: HTMLElement): { unmount(): void } {
  const el = document.createElement("section");
  el.className = "howto";
  el.innerHTML = `
    <div class="howto-box">
      <h2>How to play</h2>
      <ol>
        <li><span class="howto-ico">👆</span><span><strong>Tap a glowing area</strong> to drop a block. Place them all.</span></li>
        <li><span class="howto-ico">🧱</span><span><strong>Tap a block</strong> to turn it, raise it or open its void deck.</span></li>
        <li><span class="howto-ico">🌬️</span><span><strong>Blue is breezy, red is stuffy.</strong> Keep the score above the line.</span></li>
      </ol>
      <button class="btn btn-primary howto-ok">Got it</button>
    </div>`;
  root.append(el);
  const close = (): void => el.remove();
  el.querySelector<HTMLButtonElement>(".howto-ok")!.onclick = close;
  el.onclick = (e) => { if (e.target === el) close(); };
  return { unmount: close };
}
