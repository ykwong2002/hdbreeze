/** Cheap probe run before MapLibre is constructed so we can show a friendly message instead of a crash. */
export function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false });
    if (!gl) return false;
    const lose = gl.getExtension("WEBGL_lose_context");
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function isDevMode(): boolean {
  return new URLSearchParams(location.search).has("dev");
}
