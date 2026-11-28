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
  { name: "step-4-wide", width: 1280, height: 800, doc: "docs/evidence/step-4-wide.png" },
  { name: "step-4-narrow", width: 390, height: 844, doc: "docs/evidence/step-4-narrow.png" },
];

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

async function choose(page, label) {
  const ok = await page.evaluate((name) => {
    const found = [...document.querySelectorAll("[data-choice]")].find(
      (item) => item.textContent?.trim() === name,
    );
    const target = found?.querySelector("[role='radio'], button") ?? found;
    if (!(target instanceof HTMLElement)) return false;
    target.click();
    return true;
  }, label);
  if (!ok) throw new Error(`Could not choose ${label}`);
}

try {
  const page = await browser.newPage();
  for (const shot of shots) {
    await page.setViewport({ width: shot.width, height: shot.height, deviceScaleFactor: 1 });
    await page.goto(base, { waitUntil: "networkidle0" });
    await choose(page, "SaaS");
    await choose(page, "Users");
    await choose(page, "Records");
    const ready = await page.evaluate(() => {
      const main = document.querySelector("main");
      const stage = document.querySelector("[data-stage]");
      const viewBox = document.querySelector(".view")?.getBoundingClientRect();
      const questions = document.querySelector(".questions")?.getBoundingClientRect();
      const preview = document.querySelector(".preview")?.getBoundingClientRect();
      const wire = document.querySelector(".wire")?.getBoundingClientRect();
      const log = document.querySelector(".log")?.getBoundingClientRect();
      const sideBySide = Boolean(
        questions &&
          preview &&
          questions.x + 8 < preview.x &&
          questions.bottom > preview.top &&
          preview.bottom > questions.top,
      );
      const previewGrows = Boolean(
        viewBox &&
          preview &&
          wire &&
          log &&
          preview.height > viewBox.height * 0.9 &&
          wire.height > preview.height * 0.55 &&
          log.top - preview.bottom < 48,
      );
      const logStrip = Boolean(log && log.height > 20 && log.height < 70);
      const mark = document.querySelector("[data-stage-mark]");
      const stageShown =
        mark instanceof HTMLElement &&
        mark.textContent === "" &&
        mark.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true });
      return {
        title: document.querySelector("h1")?.textContent ?? "",
        screen: main?.getAttribute("data-screen") ?? "",
        scroll: main?.getAttribute("data-scroll") ?? "",
        stage: stage?.getAttribute("data-stage") ?? "",
        mode: stage?.getAttribute("data-mode") ?? "",
        view: document.querySelector("[data-view]")?.getAttribute("data-view") ?? "",
        views: document.querySelectorAll("[data-view]").length,
        panel: document.querySelector("[data-panel]")?.getAttribute("data-panel") ?? "",
        preview: document.querySelector("[data-preview]")?.getAttribute("data-preview") ?? "",
        gaps: [...document.querySelectorAll("[data-gap]")].map((item) => item.getAttribute("data-gap")),
        log: document.querySelectorAll("[data-log] li").length,
        advanced: [...document.querySelectorAll("button")].filter((item) => item.textContent === "Advanced")
          .length,
        pageOverflow: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
        mainOverflow: main !== null && main.scrollHeight > main.clientHeight + 1,
        sideBySide,
        previewGrows,
        logStrip,
        stageShown,
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
      ready.preview !== "saas" ||
      ready.gaps.join(",") !== "dataSource,auth,hosting" ||
      ready.log !== 0 ||
      ready.pageOverflow ||
      ready.mainOverflow ||
      !ready.sideBySide ||
      !ready.previewGrows ||
      !ready.logStrip ||
      !ready.stageShown ||
      !ready.text.includes("Event log") ||
      !ready.text.includes("asking · simple") ||
      !ready.text.includes("What are you making?") ||
      !ready.text.includes("Workspace") ||
      !ready.text.includes("Settings") ||
      ready.advanced !== 0
    ) {
      throw new Error(`${shot.name} is not the asking screen: ${JSON.stringify(ready)}`);
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
