import type { Map as MlMap } from "maplibre-gl";
import type { ScoreState } from "../game/scoring";

/**
 * Composes the map frame with a score strip into a PNG and shares it
 * (Web Share with files where supported, else download). The map canvas is
 * read right after a render so preserveDrawingBuffer can stay off.
 */
export async function captureShareImage(map: MlMap, o: { levelName: string; state: ScoreState; stars: number }): Promise<Blob> {
  const mapCanvas = map.getCanvas();
  const frame = await new Promise<HTMLCanvasElement>((resolve) => {
    map.once("render", () => {
      const c = document.createElement("canvas");
      c.width = mapCanvas.width;
      c.height = mapCanvas.height;
      c.getContext("2d")!.drawImage(mapCanvas, 0, 0);
      resolve(c);
    });
    map.triggerRepaint();
  });
  const W = 1080, H = 1350; // 4:5 portrait, LinkedIn-friendly
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d")!;
  // cover-fit the map frame
  const s = Math.max(W / frame.width, H / frame.height);
  const dw = frame.width * s, dh = frame.height * s;
  ctx.drawImage(frame, (W - dw) / 2, (H - dh) / 2, dw, dh);
  // score strip
  const stripH = 300;
  const g = ctx.createLinearGradient(0, H - stripH - 120, 0, H);
  g.addColorStop(0, "rgba(244,242,237,0)");
  g.addColorStop(0.35, "rgba(244,242,237,0.96)");
  ctx.fillStyle = g;
  ctx.fillRect(0, H - stripH - 120, W, stripH + 120);
  ctx.fillStyle = "#1f1c17";
  ctx.font = "800 54px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText(`HDBreeze · ${o.levelName}`, 56, H - 200);
  ctx.font = "700 120px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText(`${o.state.satisfaction.toFixed(0)}`, 56, H - 80);
  ctx.font = "500 40px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillStyle = "#6d6962";
  ctx.fillText(`satisfaction · ${o.state.homes.toLocaleString()} residents housed · feels like ${o.state.meanFeelsLike.toFixed(1)} °C`, 260, H - 110);
  ctx.fillStyle = "#e8b84a";
  ctx.font = "64px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText("★".repeat(o.stars) + "☆".repeat(3 - o.stars), 260, H - 180);
  ctx.fillStyle = "#6d6962";
  ctx.font = "26px -apple-system, Helvetica, Arial, sans-serif";
  ctx.fillText("Fan-made toy, not real CFD. Not affiliated with HDB or URA. Map © OpenStreetMap contributors.", 56, H - 24);
  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
}

export async function shareImage(blob: Blob, text: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], "hdbreeze.png", { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean; share?: (d: { files?: File[]; text?: string }) => Promise<void> };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], text });
    return "shared";
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "hdbreeze.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "downloaded";
}
