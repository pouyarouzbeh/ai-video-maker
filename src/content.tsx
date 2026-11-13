import {useEffect, useState, type CSSProperties, type ReactNode} from "react";
import {
  AbsoluteFill, Audio, cancelRender, continueRender, delayRender, Easing, Img,
  interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame,
} from "remotion";

type Asset = {path: string; kind: "image" | "video" | "audio"};
type Caption = {from: number; to: number; text: string};
type Detail = {label: string; value: string; tone?: "near" | "far"};
type Overlay = {
  from: number;
  to?: number;
  code?: string;
  rows?: Detail[];
  note?: string;
  marker?: {x: number; y: number; label: string; fill: string};
};
export type ContentItem = {
  id: string;
  kind: "image" | "video" | "text";
  assetIds: string[];
  title?: string;
  onScreenText?: string;
  kicker?: string;
  fit?: "cover" | "contain";
  layout?: "full" | "panel";
  trimBefore?: number;
  sourceVolume?: number;
  titleMotion?: {enterFrames: number; exitFrames?: number};
  captionCues?: Caption[];
  overlays?: Overlay[];
};
export type ContentProps = {
  cover?: boolean;
  brief: {
    slug: string; title: string; language: string;
    format: "reel" | "image" | "carousel" | "story";
    style?: {background?: string; foreground?: string; accent?: string; titleSize?: number};
  };
  files: Record<string, Asset>;
  items: ContentItem[];
  timeline: {
    fps: number;
    duration: number;
    shots: {id: string; from: number; to: number}[];
    audio?: {assetId: string; volume?: number};
  };
};

export const contentDefaults: ContentProps = {
  brief: {slug: "content", title: "", language: "fa", format: "reel"},
  files: {},
  items: [{id: "intro", kind: "text", assetIds: []}],
  timeline: {fps: 30, duration: 90, shots: [{id: "intro", from: 0, to: 90}]},
};

export function contentMetadata({props}: {props: ContentProps}) {
  const isFeed = props.brief.format === "image" || props.brief.format === "carousel";
  return {width: 1080, height: isFeed ? 1350 : 1920,
    fps: props.timeline.fps, durationInFrames: props.timeline.duration};
}

function ContentFonts({children, persian}: {children: ReactNode; persian: boolean}) {
  const [handle] = useState(() => delayRender("Load production fonts"));
  useEffect(() => {
    Promise.all([
      document.fonts.load("700 68px ContentVazirmatn", "آزمایش"),
      document.fonts.load("450 50px ContentVazirmatn", "تولید"),
      document.fonts.load("700 68px ContentVazirmatn", "Studio"),
    ]).then(() => continueRender(handle)).catch(cancelRender);
  }, [handle]);

  return <AbsoluteFill style={{fontFamily: "ContentVazirmatn, sans-serif", overflow: "hidden"}}
    dir={persian ? "rtl" : "ltr"}>
    <style>{`
      @font-face { font-family: ContentVazirmatn; font-weight: 100 900; src: url(${staticFile("fonts/vazirmatn-arabic.woff2")}); unicode-range: U+0600-06FF,U+0750-077F,U+08A0-08FF,U+200C-200F,U+FB50-FDFF,U+FE70-FEFF; }
      @font-face { font-family: ContentVazirmatn; font-weight: 100 900; src: url(${staticFile("fonts/vazirmatn-latin.woff2")}); unicode-range: U+0000-00FF,U+2000-206F; }
    `}</style>
    {children}
  </AbsoluteFill>;
}

const mediaPath = (slug: string, asset: Asset) => staticFile(slug + "/" + asset.path);
const clamped = {extrapolateLeft: "clamp", extrapolateRight: "clamp"} as const;
const mono = "Consolas, monospace";

function Heading({item, length, accent, size, cover}: {
  item: ContentItem; length: number; accent: string; size: number; cover?: boolean;
}) {
  const frame = useCurrentFrame();
  const enter = cover ? 0 : item.titleMotion?.enterFrames ?? 0;
  const exit = cover ? 0 : item.titleMotion?.exitFrames ?? 0;
  const eased = enter > 0 ? interpolate(frame, [0, enter], [0, 1], {
    ...clamped, easing: Easing.bezier(0.21, 0.72, 0.28, 1),
  }) : 1;
  const fade = exit > 0 ? interpolate(frame, [length - exit - 1, length - 1], [1, 0], clamped) : 1;

  return <div style={{opacity: eased * fade, transform: `translateY(${16 * (1 - eased)}px)`}}>
    {item.kicker && <div style={{color: accent, fontSize: 36, fontWeight: 700, marginBottom: 8}}>{item.kicker}</div>}
    {item.title && <div style={{fontSize: size, fontWeight: 850, lineHeight: 1.27, textWrap: "balance"}}>{item.title}</div>}
  </div>;
}

function TimedCopy({item, accent}: {item: ContentItem; accent: string}) {
  const frame = useCurrentFrame();
  const overlay = item.overlays?.find(({from, to}) => frame >= from && (to === undefined || frame < to));
  const cue = item.captionCues?.find(({from, to}) => frame >= from && frame < to);
  const caption = item.captionCues ? cue?.text : item.onScreenText;
  if (!overlay && !caption) return null;

  return <>
    {overlay?.marker && <div style={{
      position: "absolute", top: overlay.marker.y, left: overlay.marker.x,
      display: "flex", direction: "ltr", alignItems: "center", gap: 12,
    }}>
      <div style={{width: 62, height: 62, borderRadius: 12,
        border: "3px solid #f7f8f3", boxShadow: "0 0 0 4px #0c131bc9, 0 6px 18px #0008",
        background: overlay.marker.fill}} />
      <div dir="auto" style={{background: "#0c131bf0", color: "#f7f8f3", padding: "8px 14px",
        fontSize: 28, borderRadius: 8, fontWeight: 700}}>{overlay.marker.label}</div>
    </div>}
    {overlay && <div style={{position: "absolute", left: 76, right: 104, top: 1195,
      display: "grid", gap: 14}}>
      {overlay.code && <div dir="ltr" style={{
        font: `700 45px ${mono}`, background: "#151f29", color: accent,
        padding: "20px 24px", borderInlineStart: `4px solid ${accent}`, borderRadius: 8,
        whiteSpace: "pre-wrap", overflowWrap: "anywhere",
      }}>{overlay.code}</div>}
      {overlay.rows && <div style={{display: "flex", gap: 14}}>
        {overlay.rows.map(({label, value, tone}) =>
          <div key={label} style={{flex: 1, padding: "12px 23px", border: "1px solid #40525d",
            borderRadius: 12, background: "#111922", minWidth: 0}}>
            <div style={{fontSize: 30, opacity: 0.85}}>{label}</div>
            <div dir="auto" style={{fontSize: 42, fontWeight: 800, lineHeight: 1.25,
              color: tone === "far" ? "#ffca7e" : tone === "near" ? accent : "inherit"}}>{value}</div>
          </div>)}
      </div>}
      {overlay.note && <div style={{fontSize: 32, lineHeight: 1.35, color: "#c7d6dc"}}>{overlay.note}</div>}
    </div>}
    {caption && <div style={{position: "absolute", left: 76, right: 104, bottom: 228,
      background: "#0d141ce8", borderRadius: 14, padding: "17px 26px",
      fontSize: 44, color: "#fff", fontWeight: 650, textAlign: "center", lineHeight: 1.35,
      textWrap: "balance", whiteSpace: "pre-line"}}>{caption}</div>}
  </>;
}

function Shot({item, content, length}: {item: ContentItem; content: ContentProps; length: number}) {
  const {brief, files} = content;
  const feed = brief.format === "image" || brief.format === "carousel";
  const background = brief.style?.background ?? "#0c131b";
  const foreground = brief.style?.foreground ?? "#f5f8f9";
  const accent = brief.style?.accent ?? "#69ead9";
  const asset = files[item.assetIds[0]];
  const panel = item.layout === "panel";
  const mediaBox: CSSProperties = panel ? {
    position: "absolute", left: 42, right: 69, top: feed ? 217 : 327,
    height: feed ? 765 : 820, overflow: "hidden", border: "1px solid #ffffff24", borderRadius: 22,
  } : {position: "absolute", inset: 0, overflow: "hidden"};
  const mediaStyle: CSSProperties = {display: "block", width: "100%", height: "100%",
    objectFit: item.fit ?? (panel ? "contain" : "cover")};
  const headerTop = content.cover ? 390 : feed ? 79 : 134;
  if (content.cover && panel) mediaBox.top = 580;

  return <AbsoluteFill style={{background, color: foreground}}>
    {asset && item.kind !== "text" && <div style={mediaBox}>
      {asset.kind === "video" ?
        <OffthreadVideo src={mediaPath(brief.slug, asset)} style={mediaStyle}
          trimBefore={item.trimBefore} volume={item.sourceVolume ?? 0} /> :
        <Img src={mediaPath(brief.slug, asset)} style={mediaStyle} />}
    </div>}
    {asset && !panel && (item.title || item.onScreenText) && <AbsoluteFill style={{
      background: feed
        ? "linear-gradient(180deg, #090e17c9, transparent 32%, transparent 60%, #090e17f2)"
        : "linear-gradient(180deg, #090e17d9, transparent 34%, transparent 55%, #090e17d6)",
    }} />}
    <div style={{position: "absolute", left: 76, right: feed ? 76 : 104, top: headerTop}}>
      <Heading item={item} length={length} accent={accent} cover={content.cover}
        size={brief.style?.titleSize ?? (feed ? 69 : 76)} />
    </div>
    {feed ? item.onScreenText && <div style={{position: "absolute", left: 0, right: 0, bottom: 0,
      padding: "38px 76px 76px", background: panel ? undefined : "linear-gradient(transparent, #0c131bf7 42%)",
      fontSize: 47, lineHeight: 1.42, fontWeight: 600, whiteSpace: "pre-line"}}>{item.onScreenText}</div>
      : !content.cover && <TimedCopy item={item} accent={accent} />}
  </AbsoluteFill>;
}

export function ContentProduction(content: ContentProps) {
  const {brief, timeline, files, items} = content;
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const audio = timeline.audio;
  return <ContentFonts persian={/^(fa|ar|he|ur)(-|$)/i.test(brief.language)}>
    {timeline.shots.map(({id, from, to}) =>
      <Sequence key={id} from={from} durationInFrames={to - from} name={id}>
        <Shot item={itemsById.get(id)!} content={content} length={to - from} />
      </Sequence>)}
    {audio && <Audio src={mediaPath(brief.slug, files[audio.assetId])} volume={audio.volume ?? 1} />}
  </ContentFonts>;
}
