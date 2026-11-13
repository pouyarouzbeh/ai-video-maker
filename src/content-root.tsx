import {Composition, registerRoot} from "remotion";
import {ContentProduction, contentDefaults, contentMetadata} from "./content";

function Root() {
  return <Composition id="ContentProduction" component={ContentProduction} defaultProps={contentDefaults}
    width={1080} height={1920} fps={30} durationInFrames={90} calculateMetadata={contentMetadata} />;
}

registerRoot(Root);
