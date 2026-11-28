#!/usr/bin/env node
import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.VISUALIZER_PREVIEW_URL ?? "http://127.0.0.1:4173";
const outDir = "/opt/cursor/artifacts";
await mkdir(outDir, { recursive: true });

const shots = [
  { name: "bare-shell-wide", width: 1280, height: 800, doc: "docs/hero-bare.png" },
  { name: "bare-shell-narrow", width: 390, height: 844, doc: "docs/hero-bare-mobile.png" },
];

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage();
  for (const shot of shots) {
    await page.setViewport({ width: shot.width, height: shot.height, deviceScaleFactor: 1 });
    await page.goto(base, { waitUntil: "networkidle0" });
    const ready = await page.evaluate(() => {
      const main = document.querySelector("main");
      return {
        title: document.querySelector("h1")?.textContent ?? "",
        screen: main?.getAttribute("data-screen") ?? "",
        scroll: main?.getAttribute("data-scroll") ?? "",
        pageOverflow: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
        mainOverflow: main !== null && main.scrollHeight > main.clientHeight + 1,
        text: document.body.innerText.trim(),
      };
    });
    if (
      ready.title !== "Visualizer" ||
      ready.screen !== "empty" ||
      ready.scroll !== "false" ||
      ready.pageOverflow ||
      ready.mainOverflow ||
      ready.text !== "Visualizer"
    ) {
      throw new Error(`${shot.name} is not one empty screen: ${JSON.stringify(ready)}`);
    }
    const artifact = path.join(outDir, `${shot.name}.png`);
    await page.screenshot({
      path: artifact,
      clip: { x: 0, y: 0, width: shot.width, height: shot.height },
    });
    await copyFile(artifact, path.join(root, shot.doc));
  }
} finally {
  await browser.close();
}
