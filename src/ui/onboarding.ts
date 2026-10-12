import type { LevelSession } from "../game/level";

/** Contextual hints for a first play: each clears when the player does the thing. */
const KEY = "hdbreeze.onboarded";

export function mountOnboarding(root: HTMLElement, session: LevelSession): { unmount(): void } {
  let seen = false;
  try { seen = localStorage.getItem(KEY) === "1"; } catch { /* private mode */ }
  const el = document.createElement("div");
  el.className = "hint";
  el.hidden = true;
  root.append(el);
  let step = seen ? 3 : 0;
  let timer = 0;
  const show = (text: string): void => { el.textContent = text; el.hidden = false; };
  const hide = (): void => { el.hidden = true; };
  const advance = (): void => {
    window.clearTimeout(timer);
    if (step === 0) show("Drag a block from the tray into a glowing area.");
    else if (step === 1) show("Tap the block and try “void deck”: shade on top, breeze underneath.");
    else if (step === 2) { show("Red spots are where the wind can\u2019t reach. Angle a row of blocks to steer the breeze into them."); timer = window.setTimeout(() => { hide(); step = 3; done(); }, 7000); }
    else hide();
  };
  const done = (): void => { try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ } };
  session.blocks.onChange(() => {
    if (step === 0 && session.blocks.blocks.length > 0) { step = 1; advance(); }
    else if (step === 1 && session.blocks.blocks.some((b) => b.voidDeck)) { step = 2; advance(); }
  });
  if (step < 3) window.setTimeout(advance, 2800);
  return { unmount: () => { window.clearTimeout(timer); el.remove(); } };
}
