import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import { hasWebGL2, isDevMode } from "./capability";
import { createMap } from "./map/map";

function showUnsupported(): void {
  document.getElementById("unsupported")?.removeAttribute("hidden");
  document.querySelector(".brand")?.setAttribute("hidden", "");
}

async function boot(): Promise<void> {
  const container = document.getElementById("map");
  if (!container) throw new Error("missing #map");

  if (!hasWebGL2()) {
    showUnsupported();
    return;
  }

  try {
    const hdb = await createMap(container);
    if (isDevMode()) {
      (window as unknown as { __hdb: unknown }).__hdb = hdb;
      const status = document.getElementById("status");
      if (status) {
        status.hidden = false;
        status.textContent = `tiles: ${hdb.provider()}`;
        hdb.onFallback((p) => {
          status.textContent = `tiles: ${p} (fallback)`;
        });
      }
    }
  } catch (e) {
    console.error("[hdbreeze] map init failed", e);
    showUnsupported();
  }
}

void boot();
