import { setWorkerUrl } from "maplibre-gl";
// MapLibre 6 resolves its worker relative to its own module URL, which breaks under
// a bundler. Vite emits the worker as its own file and hands us the URL.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

setWorkerUrl(workerUrl);
