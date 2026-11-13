import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  AbsoluteFill, Audio, cancelRender, continueRender, delayRender, Easing, Img,
  interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame,
} from "remotion";

type Brief = {
  slug: string; brand: string; studio: string; domain: string; title: string; coverTitle: string;
  cta: string; catalogLabel: string; productLabel: string; detailLabel: string;
  listStep: string; productStep: string; galleryStep: string;
  tapTargets: number[][];
};
type Shot = { id: string; from: number; to: number };
type Asset = { path: string; width: number; height: number };
export type ReelProps = {
  brief: Brief;
  timeline: { fps: number; duration: number; bpm: number; shots: Shot[] };
  files: Record<string, Asset>;
};

const ink = "#251b29";
const plum = "#311f36";
const lilac = "#efcbe8";
const light = "#f8eff1";
const cream = "#f1e9e2";
const serif = "Georgia, Cambria, serif";
const sans = "Vazirmatn, Segoe UI, sans-serif";
const ease = Easing.bezier(0.22, 1, 0.36, 1);
const approach = Easing.bezier(0.62, 0, 0.24, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

function ramp(frame: number, start: number, stop: number, easing = ease) {
  return interpolate(frame, [start, stop], [0, 1], { ...clamp, easing });
}

function path({brief, files}: ReelProps, id: string, extension = "webp") {
  return staticFile(brief.slug + "/" + (files[id]?.path || id + "." + extension));
}

function Stage({children}: {children: ReactNode}) {
  const [handle] = useState(() => delayRender("Local Persian font"));
  useEffect(() => {
    Promise.all([document.fonts.load("700 60px Vazirmatn", "پیونی"), document.fonts.load("800 60px Vazirmatn", "Inform Studio")])
      .then(() => continueRender(handle)).catch(cancelRender);
  }, [handle]);
  return <AbsoluteFill style={{fontFamily: sans, overflow: "hidden"}}>
    <style>{`
      @font-face { font-family: Vazirmatn; font-weight: 400 900; src: url("${staticFile("fonts/vazirmatn-arabic.woff2")}"); unicode-range: U+0600-06FF,U+0750-077F,U+08A0-08FF,U+200C-200F,U+FB50-FDFF,U+FE70-FEFC; }
      @font-face { font-family: Vazirmatn; font-weight: 400 900; src: url("${staticFile("fonts/vazirmatn-latin.woff2")}"); unicode-range: U+0000-00FF,U+2000-206F; }
    `}</style>
    {children}
  </AbsoluteFill>;
}

function Label({children, style}: {children: ReactNode; style?: CSSProperties}) {
  return <div dir="rtl" lang="fa" style={{
    fontSize: 58, fontWeight: 800, lineHeight: 1.22, textAlign: "right", ...style,
  }}>{children}</div>;
}

function Wordmark({text, style}: {text: string; style?: CSSProperties}) {
  return <div lang="en" style={{
    fontSize: 30, fontWeight: 700, letterSpacing: 6, textTransform: "uppercase", ...style,
  }}>{text}</div>;
}

function Photo({reel, id, style}: {reel: ReelProps; id: string; style?: CSSProperties}) {
  return <Img src={path(reel, id)} style={{
    width: "100%", height: "100%", display: "block", objectFit: "cover", ...style,
  }} />;
}

const screenWidth = 632;
const screenHeight = screenWidth * 1688 / 804;

function Screen({children, style}: {children: ReactNode; style?: CSSProperties}) {
  return <div style={{
    position: "absolute", left: 209, top: 343, width: screenWidth, height: screenHeight,
    boxSizing: "content-box", overflow: "hidden", border: "9px solid #312436", borderRadius: 47,
    boxShadow: "0 43px 94px #50345065", background: cream, ...style,
  }}>{children}</div>;
}

function DarkBackdrop({children}: {children: ReactNode}) {
  return <AbsoluteFill style={{
    color: light,
    background: "radial-gradient(ellipse at 35% 35%, #69465d 0%, #38253d 44%, #1f1726 100%)",
  }}>{children}</AbsoluteFill>;
}

function Hook({reel}: {reel: ReelProps}) {
  const frame = useCurrentFrame();
  const opening = ramp(frame, 0, 36);
  const handoff = ramp(frame, 61, 89, approach);
  const card = ramp(frame, 70, 84);
  const photoInset = 94 + 211 * handoff;
  return <DarkBackdrop>
    <Wordmark text={reel.brief.brand} style={{position: "absolute", top: 239, left: 97, color: lilac, opacity: 1 - handoff}} />
    <div style={{
      position: "absolute", left: photoInset, top: 365 + 95 * handoff, width: 870 - 368 * handoff,
      height: 904 - 239 * handoff, overflow: "hidden", borderRadius: 20 + 30 * handoff,
      boxShadow: "0 46px 135px #150d1a88", background: "#d9cbbf",
      outline: "1px solid #fff4",
    }}>
      <Photo reel={reel} id="shoe-0" style={{
        objectPosition: "50% 52%", transform: "scale(" + (1.14 - opening * 0.10 - handoff * 0.04) + ")",
      }} />
      <AbsoluteFill style={{
        mixBlendMode: "soft-light",
        background: "linear-gradient(115deg, transparent 26%, #fff9dc 51%, transparent 70%)",
        transform: "translateX(" + (-102 + ramp(frame, 4, 47, approach) * 209) + "%)",
        opacity: 0.66,
      }} />
      {reel.files["card-0"] && <AbsoluteFill style={{opacity: card, background: "#fffaf9"}}>
        <Photo reel={reel} id="card-0" style={{objectFit: "contain"}} />
      </AbsoluteFill>}
    </div>
    <Label style={{position: "absolute", top: 1318, right: 182, opacity: 1 - handoff, fontSize: 89}}>
      {reel.brief.productLabel}
    </Label>
    <div style={{
      position: "absolute", top: 1475, left: 98, width: 194 - handoff * 105, height: 3,
      background: lilac, opacity: 1 - handoff,
    }} />
  </DarkBackdrop>;
}

function Phone({reel, cover = false}: {reel: ReelProps; cover?: boolean}) {
  const frame = useCurrentFrame();
  const textIn = cover ? 1 : ramp(frame, 25, 58);
  const zoom = cover ? 1 : 1 + 0.08 * ramp(frame, 134, 150, approach);
  return <AbsoluteFill style={{background: plum, color: light}}>
    <AbsoluteFill style={{transform: "scale(" + zoom + ")"}}>
      {cover
        ? <Img src={path(reel, "phone-poster", "jpg")} style={{width: "100%", height: "100%", objectFit: "cover"}} />
        : <OffthreadVideo src={path(reel, "phone", "mp4")} muted style={{width: "100%", height: "100%", objectFit: "cover"}} />}
    </AbsoluteFill>
    <AbsoluteFill style={{background: "linear-gradient(0deg,#201321 9%,#20132100 35%)"}} />
    <Label style={{
      fontSize: cover ? 74 : 64, opacity: textIn,
      position: "absolute", right: 166, left: 98, top: cover ? 1365 : 1395,
      transform: "translateY(" + ((1 - textIn) * 28) + "px)",
    }}>{cover ? reel.brief.coverTitle : reel.brief.title}</Label>
    {cover && <Wordmark text={reel.brief.studio} style={{
      position: "absolute", right: 166, top: 1492, color: lilac, fontSize: 26, letterSpacing: 5,
    }} />}
  </AbsoluteFill>;
}

function Catalog({reel}: {reel: ReelProps}) {
  const frame = useCurrentFrame();
  const exit = ramp(frame, 156, 179, approach);
  const reveal = ramp(frame, 164, 179);
  const selected = Object.keys(reel.files).filter((id) => /^card-\d$/.test(id)).sort().slice(0, 4);
  const cards = selected.length ? selected : ["shoe-0", "shoe-1", "shoe-2", "shoe-3"];
  return <AbsoluteFill style={{
    color: ink, background: "linear-gradient(140deg,#faf3ef,#e4cdd9 100%)",
  }}>
    <Label style={{position: "absolute", right: 183, top: 228, opacity: 1 - exit, fontSize: 75}}>{reel.brief.catalogLabel}</Label>
    <div style={{
      position: "absolute", left: 105, top: 401, width: 838, height: 978,
      perspective: 1300, transform: "translateY(" + (-57 * exit) + "px) scale(" + (1 + exit * 0.19) + ")",
      opacity: 1 - exit * 0.89,
    }}>
      {cards.map((id, index) => {
        const arrival = [32, 53, 70, 84][index];
        const fly = ramp(frame, arrival - 30, arrival + 1, ease);
        const settle = ramp(frame, arrival, arrival + 9, approach);
        const lag = 1 - fly;
        return <div key={id} style={{
          position: "absolute", left: index % 2 === 0 ? 427 : 0,
          top: index < 2 ? 0 : 466, width: 405, height: 443,
          background: "#fbf7f4", borderRadius: 24, overflow: "hidden",
          opacity: ramp(frame, arrival - 30, arrival - 23),
          boxShadow: "0 " + (15 + 52 * lag) + "px " + (26 + 22 * lag) + "px #4a23342e",
          transform: "translate3d(" + ((index % 2 === 0 ? 161 : -125) * lag) + "px," +
            (244 * lag - Math.sin(settle * Math.PI) * 8) + "px," + (110 * lag) + "px) rotateY(" +
            ((index % 2 === 0 ? -21 : 21) * lag) + "deg) rotateZ(" + (6 * lag) + "deg)",
          filter: lag > 0.12 ? "blur(" + (lag * 5) + "px)" : undefined,
        }}>
          <Photo reel={reel} id={id} style={{objectFit: "contain", objectPosition: "center"}} />
        </div>;
      })}
    </div>
    {frame >= 164 && <Screen style={{
      opacity: reveal, transform: "translateY(" + (62 * (1 - reveal)) + "px) scale(" + (0.87 + 0.13 * reveal) + ")",
    }}>
      <Photo reel={reel} id={reel.files["catalog-start"] ? "catalog-start" : "catalog"} />
    </Screen>}
  </AbsoluteFill>;
}

function Interaction({reel}: {reel: ReelProps}) {
  const frame = useCurrentFrame();
  const step = frame < 60 ? 0 : frame < 135 ? 1 : 2;
  const local = frame - [0, 60, 135][step];
  const title = [reel.brief.listStep, reel.brief.productStep, reel.brief.galleryStep][step];
  const progress = step === 0 ? ramp(frame, 8, 44, approach) : 0;
  const strip = reel.files["catalog-strip"];
  const width = screenWidth;
  const height = screenHeight;
  const stripHeight = strip ? width * strip.height / strip.width : height;
  const enter = ramp(local, 0, 9);
  const tap = step < 2 ? frame - (step === 0 ? 51 : 126) : -1;
  const target = reel.brief.tapTargets[step];
  return <AbsoluteFill style={{
    color: ink,
    background: "radial-gradient(ellipse at 52% 53%, #fffaf4 0%, #ebdce5 51%, #d9c2d7 100%)",
  }}>
    <Label style={{position: "absolute", right: 183, top: 223, fontSize: 66, opacity: 0.8 + enter * 0.2}}>{title}</Label>
    <Screen style={{transform: "translateY(" + (step === 0 ? 0 : (1 - enter) * 14) + "px)"}}>
      {step === 0 ? <>
        <Img src={path(reel, strip ? "catalog-strip" : "catalog")} style={{
          width, height: stripHeight, position: "absolute", top: -progress * Math.max(0, stripHeight - height),
        }} />
        {reel.files["catalog-start"] && <Img src={path(reel, "catalog-start")} style={{
          position: "absolute", inset: 0, width, height, clipPath: "inset(0 0 calc(100% - " + (width * 124 / 804) + "px) 0)",
        }} />}
        {reel.files["catalog-scroll"] && <Img src={path(reel, "catalog-scroll")} style={{
          position: "absolute", inset: 0, width, height, clipPath: "inset(calc(100% - " + (width * 160 / 804) + "px) 0 0 0)",
        }} />}
      </> : <>
        {step === 2 && <Photo reel={reel} id="product" />}
        <AbsoluteFill style={step === 2 ? {clipPath: "inset(0 0 0 " + ((1 - enter) * 100) + "%)"} : {}}>
          <Photo reel={reel} id={step === 1 ? "product" : "gallery"} />
        </AbsoluteFill>
      </>}
      {target && tap >= 0 && tap < 9 && <div style={{
        position: "absolute", left: target[0] * 100 + "%", top: target[1] * 100 + "%",
        width: 40, height: 40, borderRadius: "50%", border: "3px solid #c32e70",
        boxShadow: "0 0 0 2px #fff9", opacity: Math.sin(tap / 9 * Math.PI),
        transform: "translate(-50%,-50%) scale(" + (0.66 + 0.86 * ramp(tap, 0, 8)) + ")",
      }} />}
    </Screen>
  </AbsoluteFill>;
}

function Details({reel}: {reel: ReelProps}) {
  const frame = useCurrentFrame();
  const travel = ramp(frame, 0, 107, approach);
  const alternate = ramp(frame, 54, 69, approach);
  return <DarkBackdrop>
    <Label style={{position: "absolute", right: 181, top: 247, color: lilac, fontSize: 68}}>{reel.brief.detailLabel}</Label>
    <div style={{
      position: "absolute", left: 105, top: 412, width: 847, height: 900, perspective: 1450,
    }}>
      <div style={{
        position: "absolute", left: 265 - 31 * travel, top: 18 - 29 * travel, width: 586, height: 758,
        overflow: "hidden", borderRadius: 30, boxShadow: "0 31px 75px #1d101fa0",
        transform: "rotateY(-18deg) rotateZ(13deg)",
      }}><Photo reel={reel} id="hero-alt" style={{objectPosition: "55% 54%"}} /></div>
      <div style={{
        position: "absolute", left: 22 + 27 * travel, top: 58 + 23 * travel, width: 688, height: 849,
        overflow: "hidden", borderRadius: 27, background: cream, boxShadow: "0 45px 95px #1b101ec0",
        transform: "rotateY(" + (7 - 15 * travel) + "deg) rotateZ(" + (-7 + 10 * travel) + "deg)",
      }}>
        <Photo reel={reel} id="shoe-0" style={{objectPosition: "center", transform: "scale(" + (1.04 + travel * 0.09) + ")"}} />
        <AbsoluteFill style={{clipPath: "inset(0 0 " + (100 - alternate * 100) + "% 0)"}}>
          <Photo reel={reel} id="hero-alt" style={{objectPosition: "center"}} />
        </AbsoluteFill>
      </div>
    </div>
    <Wordmark text={reel.brief.brand} style={{position: "absolute", top: 1430, left: 111, color: lilac, fontSize: 25}} />
  </DarkBackdrop>;
}

function End({reel}: {reel: ReelProps}) {
  return <DarkBackdrop>
    <div style={{
      position: "absolute", left: 108, right: 172, top: 697, color: light,
      borderTop: "2px solid #eec9e078", paddingTop: 35,
    }}>
      <Wordmark text={reel.brief.brand} style={{color: lilac, fontSize: 24}} />
      <div style={{fontFamily: serif, fontSize: 113, lineHeight: 1.04, letterSpacing: -7, marginTop: 28, whiteSpace: "nowrap"}}>
        {reel.brief.studio}
      </div>
      <div style={{fontSize: 40, color: "#e7c7df", marginTop: 27}}>{reel.brief.domain}</div>
      <Label style={{fontSize: 39, marginTop: 46}}>{reel.brief.cta}</Label>
    </div>
  </DarkBackdrop>;
}

const scenes: Record<string, React.ComponentType<{reel: ReelProps}>> = {
  hook: Hook, phone: Phone, catalog: Catalog, interaction: Interaction, details: Details, end: End,
};

export function PortfolioReel(reel: ReelProps) {
  return <Stage>
    {reel.timeline.shots.map(({id, from, to}) => {
      const Scene = scenes[id];
      if (!Scene) throw new Error("Unknown shot: " + id);
      return <Sequence key={id} name={id} from={from} durationInFrames={to - from}>
        <Scene reel={reel} />
      </Sequence>;
    })}
    <Audio src={path(reel, "mix", "wav")} />
  </Stage>;
}

export function Cover(reel: ReelProps) {
  return <Stage><Phone reel={reel} cover /></Stage>;
}
