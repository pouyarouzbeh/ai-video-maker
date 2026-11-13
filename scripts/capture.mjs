import { chromium } from "playwright";
import sharp from "sharp";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rename, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { assets, brief, cache, fingerprint, json, locateFfmpeg, project, run } from "./project.mjs";

const manifestPath = join(project, "assets.json");
const { site, catalog, products } = brief;
const signature = fingerprint(JSON.stringify({ site, catalog, products }), readFileSync(new URL(import.meta.url)));
const cardsOnly = process.argv.includes("--cards-only");
if (!cardsOnly && !process.argv.includes("--force") && existsSync(manifestPath)) {
  const previous = json(manifestPath);
  if (previous.signature === signature && Object.values(previous.files).every(({ path }) => existsSync(join(assets, path)))) {
    console.log("Reusing storefront captures in " + assets);
    process.exit(0);
  }
}

await mkdir(assets, { recursive: true });
await mkdir(cache, { recursive: true });
const staging = await mkdtemp(join(cache, "capture-"));
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-web-security"] });
const context = await browser.newContext({
  viewport: { width: 402, height: 844 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, locale: "fa-IR",
  reducedMotion: "reduce",
});
const page = await context.newPage();
const curl = promisify(execFile);
const api = new URL(brief.site);
api.hostname = "api." + api.hostname;
const publicCatalog = /^\/api\/v1\/(products|brands|attributes|collections|categories)(\/|$)/;
await page.route((url) => url.origin === api.origin && publicCatalog.test(url.pathname), async (route) => {
  if (route.request().method() !== "GET") return route.continue();
  // The mobile client makes several catalog requests at once. Use its actual public API
  // response through a fresh transport when Chromium stalls those cross-origin requests.
  try {
    const { stdout } = await curl(process.platform === "win32" ? "curl.exe" : "curl", [
      "-fsSL", "--retry", "1", "--max-time", "42", "-H", "Origin: " + new URL(brief.site).origin, route.request().url(),
    ], { maxBuffer: 12 * 1024 * 1024, encoding: "buffer", windowsHide: true });
    await route.fulfill({ status: 200, contentType: "application/json", body: stdout,
      headers: { "access-control-allow-origin": new URL(brief.site).origin, "access-control-allow-credentials": "true" } });
  } catch {
    await route.continue().catch(() => {});
  }
});
const files = cardsOnly ? json(manifestPath).files : {};
const screenshots = { animations: "disabled", caret: "hide", timeout: 30000 };

async function startRecording() {
  const cdp = await context.newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", ({data, metadata, sessionId}) => {
    void cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    if (frames.length < 500 && Number.isFinite(metadata.timestamp)) frames.push({data, time: metadata.timestamp});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 83, maxWidth: 804, maxHeight: 1688, everyNthFrame: 2 });
  return async () => {
    await cdp.send("Page.stopScreencast");
    await cdp.detach();
    if (frames.length < 2) throw new Error("The interaction recording has fewer than two browser frames");
    const directory = join(cache, "screen-trace");
    await mkdir(directory, { recursive: true });
    const lines = ["ffconcat version 1.0"];
    for (const [index, frame] of frames.entries()) {
      const filename = "capture-" + index + ".jpg";
      await writeFile(join(directory, filename), frame.data, "base64");
      const gap = (frames[index + 1]?.time ?? (frame.time + 0.5)) - frame.time;
      lines.push("file " + filename, "duration " + Math.min(0.55, Math.max(1 / 30, gap)).toFixed(5));
    }
    lines.push("file capture-" + (frames.length - 1) + ".jpg");
    const list = join(directory, "sequence.ffconcat");
    await writeFile(list, lines.join("\n") + "\n");
    const { width, height } = await sharp(Buffer.from(frames[0].data, "base64")).metadata();
    const { ffmpeg, env } = await locateFfmpeg();
    const path = "interaction-source.mp4";
    run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "1", "-i", list,
      "-vf", "fps=30,pad=ceil(iw/2)*2:ceil(ih/2)*2", "-c:v", "libx264", "-pix_fmt", "yuv420p",
      "-crf", "20", "-movflags", "+faststart", join(staging, path)], { env });
    files["interaction-source"] = {
      path, url: new URL(brief.catalog, brief.site).href, width: Math.ceil(width / 2) * 2, height: Math.ceil(height / 2) * 2,
      note: "Live browser recording of scrolling, opening the product, and changing the gallery image",
    };
  };
}

async function settle() {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const visible = [...document.images].filter((img) => {
      const box = img.getBoundingClientRect();
      return box.bottom > 0 && box.top < innerHeight && !img.src.includes("loading-character");
    });
    await Promise.race([
      Promise.all(visible.map((img) => img.decode().catch(() => {}))),
      new Promise((resolve) => setTimeout(resolve, 9000)),
    ]);
  });
}

async function catalogPhotos() {
  await page.waitForFunction(() => {
    const visible = [...document.querySelectorAll("main img[alt]")].filter((img) => {
      const box = img.getBoundingClientRect();
      return box.top >= 75 && box.bottom <= innerHeight - 85 && box.width > 90 && box.height > 75;
    });
    return visible.length > 0 && visible.every((img) => img.complete && img.naturalWidth > 8 && !img.currentSrc.startsWith("data:"));
  }, null, { timeout: 20000 }).catch(() => {});
  await settle();
}

async function visit(path, ready) {
  const url = new URL(path, brief.site);
  await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 45000 });
  if (ready) await ready.waitFor({ state: "visible", timeout: 115000 });
  await page.waitForFunction(() => {
    const image = document.querySelector('img[src*="loading-character"]');
    return !image || !image.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  }, null, { timeout: 14000 }).catch(() => {});
  await settle();
}

async function save(id, bytes, url, extension = "webp", note) {
  const path = id + "." + extension;
  const image = sharp(bytes);
  const encoder = extension === "png" ? image.png() : image.webp({ quality: 95 });
  const info = await encoder.toFile(join(staging, path));
  files[id] = { path, url, width: info.width, height: info.height, ...(note ? { note } : {}) };
  console.log(id + ": " + info.width + "×" + info.height);
}

async function capture(id, locator = page, extension = "webp", note) {
  await save(id, await locator.screenshot(screenshots), page.url(), extension, note);
}

async function download(id, url, fallback) {
  if (url) {
    try {
      const res = await context.request.get(url, { timeout: 18000, headers: { referer: page.url() } });
      if (!res.ok()) throw new Error("HTTP " + res.status());
      await save(id, await res.body(), url);
      return;
    } catch (error) {
      console.warn(id + ": using page capture (" + error.message + ")");
    }
  }
  await capture(id, fallback, "webp", "Cropped from the live product page");
}

const productPath = (input) => new URL(input, brief.site).pathname.replace(/\/$/, "");
const productSlug = (input) => decodeURIComponent(productPath(input).split("/").at(-1));
const productLink = (input) => page.locator([
  'main a[href^="' + productPath(input) + '/"]',
  'main a[href*="slug=' + encodeURIComponent(productSlug(input)) + '"]',
].join(", ")).first();
const heroLink = () => productLink(brief.products[0]);
const main = page.locator("main").first();

async function captureCards() {
  for (const [index, product] of brief.products.entries()) {
    const link = productLink(product);
    if (!(await link.count())) continue;
    const article = link.locator("xpath=ancestor::article[1]");
    const card = await article.count() ? article : link;
    await card.evaluate((element) => element.scrollIntoView({block: "center", behavior: "instant"}));
    const element = await card.elementHandle();
    await page.waitForFunction((el) => [...el.querySelectorAll("img")].some((img) =>
      img.complete && img.naturalWidth > 8 && !img.currentSrc.startsWith("data:")), element, { timeout: 16000 });
    await settle();
    await capture("card-" + index, card, "webp", "Actual catalog card centered clear of the sticky navigation");
  }
}

async function acquire() {
  if (cardsOnly) {
    await visit(brief.catalog, heroLink());
    await captureCards();
    return;
  }
  if (process.argv.includes("--force") || !existsSync(join(assets, "home.png"))) {
    await visit(brief.site, main);
    await page.waitForFunction(() => [...document.querySelectorAll("main img")].some((img) =>
      img.complete && img.naturalWidth >= 350 && img.getBoundingClientRect().width > 240 && !img.src.includes("loading")
    ), null, { timeout: 90000 });
    await settle();
    await capture("home", page, "png");
  } else {
    const { width, height } = await sharp(join(assets, "home.png")).metadata();
    files.home = { path: "home.png", url: brief.site, width, height };
  }

  await visit(brief.catalog, heroLink());
  await capture("catalog");
  await heroLink().scrollIntoViewIfNeeded();
  const catalogTarget = await page.evaluate(() => window.scrollY);
  const catalogStart = Math.max(0, Math.round(catalogTarget) - 340);
  await page.evaluate((top) => scrollTo({top, behavior: "instant"}), catalogStart);
  await catalogPhotos();
  const start = await page.screenshot(screenshots);
  await save("catalog-start", start, page.url());
  await page.evaluate((top) => scrollTo({top, behavior: "instant"}), catalogTarget);
  await catalogPhotos();
  const end = await page.screenshot(screenshots);
  await save("catalog-scroll", end, page.url());
  const delta = Math.max(Math.round(catalogTarget) - catalogStart, 0) * 2;
  const joinAt = 1500;
  const first = await sharp(start).extract({left: 0, top: 0, width: 804, height: joinAt}).png().toBuffer();
  const second = await sharp(end).extract({
    left: 0, top: joinAt - delta, width: 804, height: 1688 - joinAt + delta,
  }).png().toBuffer();
  const strip = await sharp({create: {width: 804, height: 1688 + delta, channels: 3, background: "#fffcfa"}})
    .composite([{input: first, left: 0, top: 0}, {input: second, left: 0, top: joinAt}]).png().toBuffer();
  await save("catalog-strip", strip, page.url(), "webp", "Joined overlapping live viewport captures at their actual scroll offsets");

  await captureCards();

  await page.evaluate((top) => scrollTo(0, top), catalogStart);
  await settle();
  const stopRecording = await startRecording();
  await page.waitForTimeout(300);
  await page.evaluate((top) => scrollTo({top, behavior: "smooth"}), catalogTarget);
  await page.waitForTimeout(680);
  await heroLink().click();
  await page.waitForURL((url) => productPath(url.href) === productPath(brief.products[0]) ||
    url.searchParams.get("slug") === productSlug(brief.products[0]), { timeout: 25000 });
  await page.locator("main h1").first().waitFor({ timeout: 25000 });
  await page.getByRole("button", { name: "نمایش تصویر ۲", exact: true }).first().waitFor({ timeout: 25000 });
  await page.evaluate(() => scrollTo(0, 0));
  await settle();
  await capture("product");

  const imageUrl = () => page.locator('meta[property="og:image"]').first().getAttribute("content", { timeout: 5000 }).catch(() => null);
  const productImage = () => page.locator("main img").filter({ visible: true }).first();
  const galleryImage = () => page.locator("main img").filter({ visible: true }).evaluateAll((images) =>
    images.filter((img) => img.getBoundingClientRect().width > 180)
      .sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0]?.currentSrc || "");
  await download("shoe-0", await galleryImage() || await imageUrl(), productImage());

  const original = await galleryImage();
  const thumbs = page.locator("main button:has(img)");
  const next = page.locator('main button').filter({
    has: page.locator("img"),
  });
  const firstMatch = await thumbs.evaluateAll((buttons) => buttons.findIndex((button) => {
    const image = button.querySelector("img");
    return /(?:نمای|تصویر)\s*[۲2]|(?:view|image)\s*2/i.test((button.getAttribute("aria-label") || "") + " " + (image?.alt || ""));
  }));
  const nextArrow = page.getByRole("button", { name: /بعدی|next/i }).first();
  if (firstMatch >= 0) await thumbs.nth(firstMatch).click();
  else if (await nextArrow.isVisible()) await nextArrow.click();
  else if (await next.count() > 1) await next.nth(1).click();
  else throw new Error("Could not find the real product gallery controls.");

  const waitUntil = Date.now() + 7000;
  let alternate = await galleryImage();
  while ((!alternate || alternate === original) && Date.now() < waitUntil) {
    await page.waitForTimeout(160);
    alternate = await galleryImage();
  }
  if (!alternate || alternate === original) throw new Error("The gallery action did not change the featured image.");
  await page.evaluate(() => scrollTo(0, 0));
  await settle();
  await capture("gallery");
  await page.waitForTimeout(350);
  await stopRecording();
  await download("hero-alt", alternate, productImage());

  for (const [index, product] of brief.products.entries()) {
    if (index === 0) continue;
    await visit(product, page.locator("main h1").first());
    await download("shoe-" + index, await imageUrl(), productImage());
  }
}

try {
  await acquire();
  for (const { path } of Object.values(files)) {
    const stagedFile = join(staging, path);
    if (existsSync(stagedFile)) await rename(stagedFile, join(assets, path));
  }
  const stagedManifest = join(staging, "assets.json");
  await writeFile(stagedManifest, JSON.stringify({ signature, files }, null, 2) + "\n", "utf8");
  await rename(stagedManifest, manifestPath);
} finally {
  await browser.close();
}
