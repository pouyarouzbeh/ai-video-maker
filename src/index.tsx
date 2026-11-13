import { Composition, registerRoot } from "remotion";
import { Cover, PortfolioReel, type ReelProps } from "./reel";
import brief from "../projects/peony/brief.json";
import timeline from "../projects/peony/timeline.json";

const defaults: ReelProps = {
  brief,
  timeline,
  files: { home: { path: "home.png", width: 804, height: 1688 } },
};

function Root() {
  return <>
    <Composition id="PortfolioReel" component={PortfolioReel} defaultProps={defaults}
      width={1080} height={1920} fps={30} durationInFrames={840}
      calculateMetadata={({props}) => ({
        fps: props.timeline.fps, durationInFrames: props.timeline.duration,
      })} />
    <Composition id="PortfolioCover" component={Cover} defaultProps={defaults}
      width={1080} height={1920} fps={30} durationInFrames={1} />
  </>;
}

registerRoot(Root);
