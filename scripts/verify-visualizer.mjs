#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sessionPath = "/tmp/verify-visualizer/session.json";
const evidenceDir = "/opt/cursor/artifacts/verify-visualizer";
const port = 4183;
const url = `http://127.0.0.1:${port}/`;
const chrome = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";

function readSession() {
  if (!existsSync(sessionPath)) {
    throw new Error("No verification session. Run launch first.");
  }
  return JSON.parse(readFileSync(sessionPath, "utf8"));
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readDevtoolsPort(profile) {
  const portFile = path.join(profile, "DevToolsActivePort");
  const started = Date.now();
  while (Date.now() - started < 10000) {
    if (existsSync(portFile)) {
      const portText = readFileSync(portFile, "utf8").split("\n")[0]?.trim();
      if (portText) return portText;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Chrome did not write a DevTools port");
}

async function waitForReady() {
  const started = Date.now();
  while (Date.now() - started < 20000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      void 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Preview did not answer at ${url}`);
}

async function readScreen(page) {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    const pageOverflow = document.documentElement.scrollHeight > document.documentElement.clientHeight + 1;
    const mainOverflow =
      main !== null && main.scrollHeight > main.clientHeight + 1;
    return {
      title: document.querySelector("h1")?.textContent ?? "",
      screen: main?.getAttribute("data-screen") ?? "",
      scroll: main?.getAttribute("data-scroll") ?? "",
      regions: document.querySelectorAll("main, section, article, ul, ol").length,
      pageOverflow,
      mainOverflow,
      text: document.body.innerText.trim(),
    };
  });
}

function assertScreen(ready) {
  if (
    ready.title !== "Visualizer" ||
    ready.screen !== "empty" ||
    ready.scroll !== "false" ||
    ready.regions !== 1 ||
    ready.pageOverflow ||
    ready.mainOverflow ||
    ready.text !== "Visualizer"
  ) {
    throw new Error(`Preview is not one empty screen: ${JSON.stringify(ready)}`);
  }
}

async function launch() {
  if (existsSync(sessionPath)) {
    throw new Error("A verification session already exists. Run cleanup first.");
  }
  mkdirSync(path.dirname(sessionPath), { recursive: true });
  mkdirSync(evidenceDir, { recursive: true });
  const build = spawn("pnpm", ["--filter", "@visualizer/web", "build"], {
    cwd: root,
    stdio: "inherit",
  });
  const buildCode = await new Promise((resolve) => build.on("close", resolve));
  if (buildCode !== 0) throw new Error("Production build failed");

  const preview = spawn(
    "pnpm",
    [
      "--filter",
      "@visualizer/web",
      "exec",
      "vite",
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    { cwd: root, detached: true, stdio: "ignore" },
  );
  preview.unref();
  await waitForReady();

  const profile = "/tmp/verify-visualizer/chrome-profile";
  rmSync(profile, { recursive: true, force: true });
  mkdirSync(profile, { recursive: true });
  const chromeProc = spawn(
    chrome,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
    ],
    { detached: true, stdio: "ignore" },
  );
  chromeProc.unref();
  const devtoolsPort = await readDevtoolsPort(profile);
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${devtoolsPort}`,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(url, { waitUntil: "networkidle0" });
  assertScreen(await readScreen(page));
  if (!preview.pid || !chromeProc.pid) throw new Error("Missing process id");
  writeFileSync(
    sessionPath,
    JSON.stringify(
      {
        previewPid: preview.pid,
        browserPid: chromeProc.pid,
        wsEndpoint: browser.wsEndpoint(),
        url,
        evidenceDir,
      },
      null,
      2,
    ),
  );
  await browser.disconnect();
  console.log(JSON.stringify({ ok: true, url, evidenceDir }));
}

async function doctor() {
  const session = readSession();
  const previewUp = alive(session.previewPid);
  const browserUp = alive(session.browserPid);
  const response = await fetch(session.url);
  const body = await response.text();
  const report = {
    ok: previewUp && browserUp && response.ok && body.includes("Visualizer"),
    url: session.url,
    previewPid: session.previewPid,
    browserPid: session.browserPid,
    previewUp,
    browserUp,
    status: response.status,
    evidenceDir: session.evidenceDir,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

async function connect() {
  const session = readSession();
  const browser = await puppeteer.connect({ browserWSEndpoint: session.wsEndpoint });
  const pages = await browser.pages();
  const page = pages.find((candidate) => candidate.url().startsWith(session.url));
  if (!page) throw new Error("Verification page is gone");
  return { browser, page, session };
}

async function browserCommand(argv) {
  const { browser, page } = await connect();
  try {
    const [action, ...rest] = argv;
    if (action === "reload") {
      await page.reload({ waitUntil: "networkidle0" });
      assertScreen(await readScreen(page));
      console.log(JSON.stringify({ ok: true, action }));
      return;
    }
    if (action === "text") {
      const ready = await readScreen(page);
      assertScreen(ready);
      const destination = flag(rest, "--path");
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, ready.text);
      console.log(JSON.stringify({ ok: true, path: destination }));
      return;
    }
    if (action === "screenshot") {
      assertScreen(await readScreen(page));
      const destination = flag(rest, "--path");
      mkdirSync(path.dirname(destination), { recursive: true });
      await page.screenshot({ path: destination });
      console.log(JSON.stringify({ ok: true, path: destination }));
      return;
    }
    throw new Error(`Unknown browser action ${action}`);
  } finally {
    await browser.disconnect();
  }
}

function flag(argv, name) {
  const index = argv.indexOf(name);
  const value = index === -1 ? undefined : argv[index + 1];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function drive(feature) {
  if (feature !== "bare-shell") throw new Error(`Unmapped feature ${feature}`);
  await browserCommand(["text", "--path", path.join(evidenceDir, "bare-shell.txt")]);
  await browserCommand(["screenshot", "--path", path.join(evidenceDir, "bare-shell.png")]);
  console.log(JSON.stringify({ ok: true, feature, evidenceDir }));
}

function cleanup() {
  if (!existsSync(sessionPath)) {
    console.log(JSON.stringify({ ok: true, removed: false, evidenceDir }));
    return;
  }
  const session = readSession();
  for (const pid of [session.browserPid, session.previewPid]) {
    if (!alive(pid)) continue;
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        void 0;
      }
    }
  }
  rmSync(sessionPath);
  console.log(
    JSON.stringify({
      ok: true,
      removed: true,
      evidenceKept: existsSync(path.join(evidenceDir, "bare-shell.png")),
      evidenceDir,
    }),
  );
}

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === "launch") await launch();
  else if (command === "doctor") await doctor();
  else if (command === "browser") await browserCommand(rest);
  else if (command === "drive") await drive(rest[0]);
  else if (command === "cleanup") cleanup();
  else throw new Error("Use launch, doctor, browser, drive, or cleanup");
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
