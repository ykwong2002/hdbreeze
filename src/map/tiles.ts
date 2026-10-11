import { addProtocol } from "maplibre-gl";

/** Where the basemap tiles come from right now. */
export type TileProvider = "openfreemap" | "pmtiles";

export const OPENFREEMAP_TILEJSON = "https://tiles.openfreemap.org/planet";

/** Self-hosted Protomaps PMTiles URL from the build env, or undefined when not configured. */
export function configuredPmtilesUrl(): string | undefined {
  const url = (import.meta.env.VITE_PMTILES_URL as string | undefined)?.trim();
  return url ? url : undefined;
}

let protocolReady: Promise<void> | undefined;

/** Lazily loads the `pmtiles` package and registers the `pmtiles://` protocol once. */
export function enablePmtilesProtocol(): Promise<void> {
  protocolReady ??= import("pmtiles").then(({ Protocol }) => {
    const protocol = new Protocol();
    addProtocol("pmtiles", protocol.tile);
  });
  return protocolReady;
}
