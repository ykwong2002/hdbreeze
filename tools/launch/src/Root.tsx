import { Composition } from "remotion";
import { Launch, LAUNCH_FPS, LAUNCH_SECONDS } from "./Launch";

export const RemotionRoot = () => (
  <Composition id="Launch" component={Launch} durationInFrames={LAUNCH_SECONDS * LAUNCH_FPS} fps={LAUNCH_FPS} width={1080} height={1920} />
);
