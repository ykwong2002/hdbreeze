import "./worker";
import { Map as MlMap, AttributionControl, NavigationControl, type MapOptions } from "maplibre-gl";
import { buildStyle } from "./style";
import { configuredPmtilesUrl, enablePmtilesProtocol, OPENFREEMAP_TILEJSON, type TileProvider } from "./tiles";

/** Singapore overview camera and limits. Levels fly the camera in from here. */
export const SINGAPORE_VIEW = {
  center: [103.82, 1.352] as [number, number],
  zoom: 10.8,
  minZoom: 10,
  maxZoom: 18,
  maxBounds: [
    [103.45, 1.1],
    [104.25, 1.55],
  ] as [[number, number], [number, number]],
};

export interface HdbMap {
  map: MlMap;
  provider(): TileProvider;
  /** Fires once if the basemap falls back to the self-hosted PMTiles source. */
  onFallback(cb: (provider: TileProvider) => void): void;
}

/** Dev override: `?tiles=pmtiles` starts on the self-hosted fallback so it can be checked on a phone. */
function forcedProvider(): TileProvider | undefined {
  const v = new URLSearchParams(location.search).get("tiles");
  return v === "pmtiles" || v === "openfreemap" ? v : undefined;
}

/** Dev override: `?cam=lon,lat,zoom[,pitch[,bearing]]` for repeatable screenshots. */
function cameraOverride(): Partial<Pick<MapOptions, "center" | "zoom" | "pitch" | "bearing">> {
  const raw = new URLSearchParams(location.search).get("cam");
  if (!raw) return {};
  const [lon, lat, zoom, pitch, bearing] = raw.split(",").map(Number);
  if (lon === undefined || lat === undefined || zoom === undefined || [lon, lat, zoom].some(Number.isNaN)) return {};
  return {
    center: [lon, lat],
    zoom,
    ...(pitch !== undefined && !Number.isNaN(pitch) ? { pitch } : {}),
    ...(bearing !== undefined && !Number.isNaN(bearing) ? { bearing } : {}),
  };
}

export async function createMap(container: HTMLElement): Promise<HdbMap> {
  const fallbackUrl = configuredPmtilesUrl();
  const startOnFallback = forcedProvider() === "pmtiles" && fallbackUrl !== undefined;
  if (startOnFallback) await enablePmtilesProtocol();

  const options: MapOptions = {
    container,
    style: startOnFallback
      ? buildStyle("protomaps", { pmtilesUrl: fallbackUrl })
      : buildStyle("openmaptiles", { tileJsonUrl: OPENFREEMAP_TILEJSON }),
    center: SINGAPORE_VIEW.center,
    zoom: SINGAPORE_VIEW.zoom,
    minZoom: SINGAPORE_VIEW.minZoom,
    maxZoom: SINGAPORE_VIEW.maxZoom,
    maxBounds: SINGAPORE_VIEW.maxBounds,
    maxPitch: 60,
    ...cameraOverride(),
    attributionControl: false,
    canvasContextAttributes: { antialias: false },
    hash: false,
    fadeDuration: 150,
    touchPitch: true,
    dragRotate: true,
  };

  const map = new MlMap(options);
  map.addControl(new AttributionControl({ compact: true }));
  map.addControl(new NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");
  map.touchZoomRotate.enableRotation();

  let provider: TileProvider = startOnFallback ? "pmtiles" : "openfreemap";
  const fallbackListeners: Array<(p: TileProvider) => void> = [];

  if (!startOnFallback) watchBasemapHealth(map, () => {
    provider = "pmtiles";
    for (const cb of fallbackListeners) cb(provider);
  });

  return {
    map,
    provider: () => provider,
    onFallback: (cb) => {
      fallbackListeners.push(cb);
    },
  };
}

/**
 * Swap to the self-hosted PMTiles basemap if OpenFreeMap fails. Two failed
 * tile or TileJSON requests are enough: a healthy session normally has zero.
 * Does nothing when no fallback URL is configured.
 */
function watchBasemapHealth(map: MlMap, onSwitched: () => void): void {
  const fallbackUrl = configuredPmtilesUrl();
  if (!fallbackUrl) return;

  let failures = 0;
  let switching = false;

  const handler = (ev: { error?: unknown }) => {
    if (switching) return;
    const err = ev.error as { url?: string; status?: number; message?: string } | undefined;
    const url = err?.url ?? "";
    if (!url.includes("openfreemap.org")) return;
    failures += 1;
    if (failures < 2) return;

    switching = true;
    map.off("error", handler);
    void enablePmtilesProtocol()
      .then(() => {
        map.setStyle(buildStyle("protomaps", { pmtilesUrl: fallbackUrl }), { diff: false });
        onSwitched();
      })
      .catch((e: unknown) => {
        console.warn("[hdbreeze] basemap fallback failed", e);
      });
  };

  map.on("error", handler);
}
