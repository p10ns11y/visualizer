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
  { name: "step-3-wide", width: 1280, height: 800, doc: "docs/evidence/step-3-wide.png" },
  { name: "step-3-narrow", width: 390, height: 844, doc: "docs/evidence/step-3-narrow.png" },
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
      const stage = document.querySelector("[data-stage]");
      return {
        title: document.querySelector("h1")?.textContent ?? "",
        screen: main?.getAttribute("data-screen") ?? "",
        scroll: main?.getAttribute("data-scroll") ?? "",
        stage: stage?.getAttribute("data-stage") ?? "",
        mode: stage?.getAttribute("data-mode") ?? "",
        view: document.querySelector("[data-view]")?.getAttribute("data-view") ?? "",
        views: document.querySelectorAll("[data-view]").length,
        panel: document.querySelector("[data-panel]")?.getAttribute("data-panel") ?? "",
        log: document.querySelectorAll("[data-log] li").length,
        advanced: [...document.querySelectorAll("button")].filter((item) => item.textContent === "Advanced").length,
        pageOverflow: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
        mainOverflow: main !== null && main.scrollHeight > main.clientHeight + 1,
        text: document.body.innerText.trim(),
      };
    });
    if (
      ready.title !== "Visualizer" ||
      ready.screen !== "flow" ||
      ready.scroll !== "false" ||
      ready.stage !== "asking" ||
      ready.mode !== "simple" ||
      ready.view !== "asking" ||
      ready.views !== 1 ||
      ready.panel !== "" ||
      ready.log !== 0 ||
      ready.pageOverflow ||
      ready.mainOverflow ||
      !ready.text.includes("Event log") ||
      !ready.text.includes("asking · simple") ||
      !ready.text.includes("Questions") ||
      !ready.text.includes("Settings") ||
      ready.advanced !== 0
    ) {
      throw new Error(`${shot.name} is not the flow screen: ${JSON.stringify(ready)}`);
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
