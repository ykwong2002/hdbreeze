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
    if (step === 0) show("Tap a highlighted area to place your first block.");
    else if (step === 1) show("Tap the block, then try “void deck”: the breeze flows under it.");
    else if (step === 2) { show("Blue is breezy, red is stuffy. Keep the walkways blue and place every block."); timer = window.setTimeout(() => { hide(); step = 3; done(); }, 7000); }
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
