import {readFile, writeFile} from "node:fs/promises";

const path = (file) => new URL(file, import.meta.url);
const {runs} = JSON.parse(await readFile(path("depth-trace.json"), "utf8"));
const storyboard = JSON.parse(await readFile(path("storyboard.json"), "utf8"));
const label = {near: "فیروزه‌ای", far: "کهربایی"};
const number = (depth) => depth.toFixed(2);
const sampleMarker = (visible) => ({
  x: 490, y: 703, label: "رنگِ خروجی در این نقطه",
  fill: {near: "#69ead9", far: "#ffca7e", none: "#111922"}[visible],
});
for (const [index, id] of ["near-first", "far-first"].entries()) {
  const {steps, clearDepth} = runs[index];
  const item = storyboard.items.find((entry) => entry.id === id);
  const overlay = item.overlays;
  overlay[0].rows = [{label: "عمق اولیه", value: number(clearDepth)}];
  overlay[0].marker = sampleMarker("none");
  for (const [stepIndex, step] of steps.entries()) {
    const previousDepth = steps[stepIndex - 1]?.storedDepth ?? clearDepth;
    overlay[stepIndex + 1].code = number(step.inputDepth) + " < " + number(previousDepth);
    overlay[stepIndex + 1].rows = [
      {label: "عمقِ ثبت‌شده", value: number(step.storedDepth), tone: step.visible},
      {label: "نتیجهٔ ورودی", value: step.passed ? "پذیرفته شد" : "رد شد", tone: step.input},
    ];
    overlay[stepIndex + 1].note = "سطح دیده‌شده در نقطهٔ مشترک «" + label[step.visible] + "»";
    overlay[stepIndex + 1].marker = sampleMarker(step.visible);
  }
}
const comparison = storyboard.items.find(({id}) => id === "rule").overlays[0];
comparison.rows.forEach((row, index) => { row.value = number(runs[0].steps[index].inputDepth); });
comparison.marker = sampleMarker(runs[0].steps[0].visible);
const answer = storyboard.items.find(({id}) => id === "answer").overlays[0];
answer.rows.forEach((row, index) => {
  const ending = runs[index].steps.at(-1);
  row.value = number(ending.storedDepth);
  row.tone = ending.visible;
});
answer.marker = sampleMarker(runs[0].steps.at(-1).visible);
await writeFile(path("storyboard.json"), JSON.stringify(storyboard, null, 2) + "\n");
