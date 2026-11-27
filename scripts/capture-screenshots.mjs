import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const base = process.env.VISUALIZER_PREVIEW_URL ?? "http://127.0.0.1:4173";
const outDir = "/opt/cursor/artifacts";
await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const shots = [
  { name: "cockpit-desktop", hash: "#cockpit", width: 1280, height: 800 },
  { name: "cockpit-mobile", hash: "#cockpit", width: 390, height: 844 },
  { name: "code-desktop", hash: "#code", width: 1280, height: 800 },
  { name: "code-mobile", hash: "#code", width: 390, height: 844 },
];

try {
  const page = await browser.newPage();
  for (const shot of shots) {
    await page.setViewport({ width: shot.width, height: shot.height, deviceScaleFactor: 1 });
    await page.goto(`${base}/${shot.hash}`, { waitUntil: "networkidle0" });
    await page.waitForSelector(".shell");
    const mode = await page.$eval(".shell", (node) => node.getAttribute("data-mode"));
    const expected = shot.hash === "#code" ? "code" : "cockpit";
    if (mode !== expected) {
      throw new Error(`Expected ${expected} on ${shot.name}, saw ${mode}`);
    }
    await page.screenshot({
      path: `${outDir}/${shot.name}.png`,
      clip: { x: 0, y: 0, width: shot.width, height: shot.height },
    });
  }

  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.goto(`${base}/#cockpit`, { waitUntil: "networkidle0" });
  await page.click("button.build, .build");
  await page.waitForSelector(".banner.working", { timeout: 2000 });
  await page.click("button.stop, .stop");
  await page.waitForSelector(".banner.paused");
  await page.click("button.resume, .resume");
  await page.waitForFunction(
    () => document.querySelector(".shell")?.getAttribute("data-phase") === "completed",
    { timeout: 8000 },
  );
  const title = await page.$eval(".brief h2", (node) => node.textContent);
  if (title !== "Visualizer Step 2") {
    throw new Error(`Unexpected brief title: ${title}`);
  }
  await page.screenshot({
    path: `${outDir}/brief-desktop.png`,
    clip: { x: 0, y: 0, width: 1280, height: 800 },
  });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.screenshot({
    path: `${outDir}/brief-mobile.png`,
    clip: { x: 0, y: 0, width: 390, height: 844 },
  });
} finally {
  await browser.close();
}
