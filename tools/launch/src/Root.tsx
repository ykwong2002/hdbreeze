import { Composition } from "remotion";
import { Launch, LAUNCH_FPS, LAUNCH_SECONDS } from "./Launch";
import { Teaser } from "./teaser/Teaser";

const TEASER_URL = "hdbreeze.ykbuilds.workers.dev";

export const RemotionRoot = () => (
  <>
    <Composition id="Launch" component={Launch} durationInFrames={LAUNCH_SECONDS * LAUNCH_FPS} fps={LAUNCH_FPS} width={1080} height={1920} />
    <Composition id="Teaser" component={Teaser as unknown as React.FC<Record<string, unknown>>} durationInFrames={450} fps={30} width={1080} height={1350} defaultProps={{ layout: "portrait" as const, url: TEASER_URL }} />
    <Composition id="Og" component={Teaser as unknown as React.FC<Record<string, unknown>>} durationInFrames={450} fps={30} width={1200} height={630} defaultProps={{ layout: "og" as const, url: TEASER_URL }} />
    <Composition id="TeaserSquare" component={Teaser as unknown as React.FC<Record<string, unknown>>} durationInFrames={450} fps={30} width={1080} height={1080} defaultProps={{ layout: "square" as const, url: TEASER_URL }} />
  </>
);
