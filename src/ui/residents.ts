import type { ResidentBrain } from "../lm/resident";
import { pickLine, type Tier } from "../game/lines";

/** "Hear the residents" card: fresh lines from the tiny language model for the current comfort tier. */
export function showResidents(root: HTMLElement, brain: ResidentBrain, tier: () => Tier, feels: () => number): { unmount(): void } {
  const el = document.createElement("section");
  el.className = "howto residents";
  el.innerHTML = `
    <div class="howto-box">
      <h2>What the residents say</h2>
      <p class="residents-sub"></p>
      <ul class="residents-lines"></ul>
      <div class="residents-btns"><button class="btn btn-primary more">Hear more</button><button class="btn ok">Close</button></div>
      <p class="residents-note"></p>
    </div>`;
  root.append(el);
  const list = el.querySelector<HTMLUListElement>(".residents-lines")!;
  const sub = el.querySelector<HTMLElement>(".residents-sub")!;
  const note = el.querySelector<HTMLElement>(".residents-note")!;
  const label: Record<Tier, string> = { miserable: "sweltering", warm: "warm", pleasant: "breezy", cold: "chilly" };
  let busy = false;
  const fill = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    const t = tier();
    sub.textContent = `It feels ${label[t]} on the walkways right now (${feels().toFixed(1)} °C).`;
    list.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      const li = document.createElement("li");
      li.textContent = "…";
      list.append(li);
      const line = brain.ready ? await brain.say(t, 0.9 + 0.1 * i) : null;
      li.textContent = line ?? pickLine(t);
      li.classList.toggle("canned", !line);
    }
    note.textContent = brain.ready
      ? `Lines made up on your phone by a tiny language model (${(brain.params / 1e6).toFixed(1)}M parameters) trained only on Singlish weather complaints. It knows nothing else.`
      : "The residents' language model is still loading; these are from the script.";
    busy = false;
  };
  el.querySelector<HTMLButtonElement>(".more")!.onclick = () => void fill();
  const close = (): void => el.remove();
  el.querySelector<HTMLButtonElement>(".ok")!.onclick = close;
  el.onclick = (e) => { if (e.target === el) close(); };
  void fill();
  return { unmount: close };
}
