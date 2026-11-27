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
      // preview is still binding the port
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Preview did not answer at ${url}`);
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
  const ready = await page.$eval(".shell", (node) => ({
    mode: node.getAttribute("data-mode"),
    phase: node.getAttribute("data-phase"),
    version: document.querySelector(".version")?.textContent ?? "",
    title: document.querySelector("h1")?.textContent ?? "",
  }));
  if (ready.mode !== "cockpit" || ready.phase !== "idle" || ready.version !== "v0" || ready.title !== "Visualizer") {
    throw new Error(`Preview is not a fresh cockpit: ${JSON.stringify(ready)}`);
  }
  if (!preview.pid || !chromeProc.pid) throw new Error("Missing process id");
  const browserPid = chromeProc.pid;
  writeFileSync(
    sessionPath,
    JSON.stringify(
      {
        previewPid: preview.pid,
        browserPid,
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
    if (action === "click") {
      const name = flag(rest, "--name");
      const role = flag(rest, "--role");
      const handle =
        role === "button" && name === "Code Mode"
          ? await page.$('button[aria-label="Code Mode"]')
          : await findButton(page, name);
      if (!handle) throw new Error(`Missing ${role} ${name}`);
      await handle.click();
      console.log(JSON.stringify({ ok: true, action, name }));
      return;
    }
    if (action === "fill") {
      const name = flag(rest, "--name");
      const value = flag(rest, "--value");
      const field = await page.$(`textarea[aria-label="${name}"]`);
      if (!field) throw new Error(`Missing textbox ${name}`);
      await field.evaluate((node, next) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
        if (!setter) throw new Error("Missing textarea value setter");
        setter.call(node, next);
        node.dispatchEvent(new Event("input", { bubbles: true }));
      }, value);
      console.log(JSON.stringify({ ok: true, action, name }));
      return;
    }
    if (action === "draw") {
      const card = flag(rest, "--card");
      const surface = await page.$(`svg[data-sketch="${card}"]`);
      if (!surface) throw new Error(`Missing sketch surface ${card}`);
      const box = await surface.boundingBox();
      if (!box) throw new Error(`Sketch surface ${card} has no box`);
      const marks = [
        [0.18, 0.32],
        [0.46, 0.22],
        [0.74, 0.48],
        [0.4, 0.72],
      ];
      const first = marks[0];
      if (!first) throw new Error("Missing stroke sample");
      await page.mouse.move(box.x + box.width * first[0], box.y + box.height * first[1]);
      await page.mouse.down();
      for (const mark of marks.slice(1)) {
        await page.mouse.move(box.x + box.width * mark[0], box.y + box.height * mark[1], {
          steps: 8,
        });
      }
      await page.mouse.up();
      await page.waitForFunction(
        () => document.querySelector(".shell")?.getAttribute("data-stroke-count") === "1",
      );
      console.log(JSON.stringify({ ok: true, action, card }));
      return;
    }
    if (action === "reload") {
      await page.reload({ waitUntil: "networkidle0" });
      await page.waitForSelector(".shell");
      console.log(JSON.stringify({ ok: true, action }));
      return;
    }
    if (action === "text") {
      const text = await page.$eval(".shell", (node) => {
        const fields = [...node.querySelectorAll("textarea")].map(
          (field) => `${field.getAttribute("aria-label")}: ${field.value}`,
        );
        return `${node.innerText}\n\n${fields.join("\n")}`;
      });
      const destination = flag(rest, "--path");
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, text);
      console.log(JSON.stringify({ ok: true, path: destination }));
      return;
    }
    if (action === "screenshot") {
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

async function findButton(page, name) {
  const buttons = await page.$$("button");
  for (const button of buttons) {
    const text = await button.evaluate((node) => node.textContent?.trim());
    if (text === name) return button;
  }
  return null;
}

function flag(argv, name) {
  const index = argv.indexOf(name);
  const value = index === -1 ? undefined : argv[index + 1];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function drive(feature) {
  if (feature === "freehand-canvas-sketch") {
    await browserCommand(["draw", "--card", "card-canvas"]);
    await browserCommand(["reload"]);
    const { browser, page } = await connect();
    try {
      const kept = await page.evaluate(() => ({
        count: document.querySelector(".shell")?.getAttribute("data-stroke-count"),
        version: document.querySelector(".version")?.textContent ?? "",
        ink: document.querySelector(".sketch-pad path")?.getAttribute("d") ?? "",
      }));
      if (kept.count !== "1" || kept.version !== "v1" || kept.ink.length < 8) {
        throw new Error(`Reload dropped the stroke: ${JSON.stringify(kept)}`);
      }
    } finally {
      await browser.disconnect();
    }
    await browserCommand(["click", "--role", "button", "--name", "Code Mode"]);
    const after = await connect();
    try {
      await after.page.waitForFunction(
        () => document.querySelector(".shell")?.getAttribute("data-mode") === "code",
      );
      const observed = await after.page.evaluate(() => ({
        mode: document.querySelector(".shell")?.getAttribute("data-mode"),
        version: document.querySelector(".version")?.textContent ?? "",
        text: document.body.innerText,
      }));
      if (
        observed.mode !== "code" ||
        observed.version !== "v2" ||
        !observed.text.includes("stroke-2") ||
        !observed.text.includes("1 stroke pinned to Freehand canvas sketching")
      ) {
        throw new Error(`Code mode did not show the stroke: ${JSON.stringify(observed)}`);
      }
    } finally {
      await after.browser.disconnect();
    }
    await browserCommand([
      "text",
      "--path",
      path.join(evidenceDir, "freehand-canvas-sketch.txt"),
    ]);
    await browserCommand([
      "screenshot",
      "--path",
      path.join(evidenceDir, "freehand-canvas-sketch.png"),
    ]);
    console.log(JSON.stringify({ ok: true, feature, evidenceDir }));
    return;
  }
  if (feature !== "visual-cockpit-editing") {
    throw new Error(`Unmapped feature ${feature}`);
  }
  const statement = "Verification stroke pinned to the canvas card.";
  await browserCommand([
    "fill",
    "--role",
    "textbox",
    "--name",
    "Statement for Freehand canvas sketching",
    "--value",
    statement,
  ]);
  await browserCommand(["click", "--role", "button", "--name", "Code Mode"]);
  const { browser, page } = await connect();
  try {
    await page.waitForFunction(
      () => document.querySelector(".shell")?.getAttribute("data-mode") === "code",
    );
    const observed = await page.evaluate(() => {
      const field = document.querySelector(
        'textarea[aria-label="Statement for Freehand canvas sketching"]',
      );
      return {
        mode: document.querySelector(".shell")?.getAttribute("data-mode"),
        version: document.querySelector(".version")?.textContent ?? "",
        statement: field instanceof HTMLTextAreaElement ? field.value : "",
      };
    });
    if (
      observed.mode !== "code" ||
      observed.version !== "v2" ||
      !observed.statement.includes(statement)
    ) {
      throw new Error(`Code mode did not share the edit: ${JSON.stringify(observed)}`);
    }
  } finally {
    await browser.disconnect();
  }
  await browserCommand([
    "text",
    "--path",
    path.join(evidenceDir, "visual-cockpit-editing.txt"),
  ]);
  await browserCommand([
    "screenshot",
    "--path",
    path.join(evidenceDir, "visual-cockpit-editing.png"),
  ]);
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
        // already gone
      }
    }
  }
  rmSync(sessionPath);
  console.log(
    JSON.stringify({
      ok: true,
      removed: true,
      evidenceKept: existsSync(path.join(evidenceDir, "visual-cockpit-editing.png")),
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
