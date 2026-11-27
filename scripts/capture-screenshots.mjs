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

  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.goto(`${base}/?sketch=1#cockpit`, { waitUntil: "networkidle0" });
  const pad = await page.$('svg[data-sketch="card-canvas"]');
  if (!pad) throw new Error("Missing sketch surface");
  const box = await pad.boundingBox();
  if (!box) throw new Error("Sketch surface has no box");
  const marks = [
    [0.1, 0.58],
    [0.22, 0.34],
    [0.36, 0.26],
    [0.5, 0.4],
    [0.62, 0.62],
    [0.74, 0.36],
    [0.88, 0.3],
  ];
  const start = marks[0];
  if (!start) throw new Error("Missing stroke sample");
  await page.mouse.move(box.x + box.width * start[0], box.y + box.height * start[1]);
  await page.mouse.down();
  for (const mark of marks.slice(1)) {
    await page.mouse.move(box.x + box.width * mark[0], box.y + box.height * mark[1], { steps: 10 });
  }
  await page.mouse.up();
  await page.waitForFunction(
    () => document.querySelector(".shell")?.getAttribute("data-stroke-count") === "1",
  );
  await page.screenshot({
    path: `${outDir}/sketch-cockpit-desktop.png`,
    clip: { x: 0, y: 0, width: 1280, height: 800 },
  });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.$eval('svg[data-sketch="card-canvas"]', (node) => {
    node.scrollIntoView({ block: "center", inline: "nearest" });
  });
  await page.screenshot({
    path: `${outDir}/sketch-cockpit-mobile.png`,
    captureBeyondViewport: false,
  });
  await page.click('button[aria-label="Code Mode"]');
  await page.waitForFunction(
    () => document.querySelector(".shell")?.getAttribute("data-mode") === "code",
  );
  await page.$eval(".sketch-list", (node) => {
    node.scrollIntoView({ block: "start", inline: "nearest" });
  });
  await page.screenshot({
    path: `${outDir}/sketch-code-mobile.png`,
    captureBeyondViewport: false,
  });
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.$eval(".sketch-list", (node) => {
    node.scrollIntoView({ block: "start", inline: "nearest" });
  });
  await page.screenshot({
    path: `${outDir}/sketch-code-desktop.png`,
    captureBeyondViewport: false,
  });
} finally {
  await browser.close();
}
