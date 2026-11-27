import { BrainRouter, createLocalModelContext, workspaceStorageKey } from "@visualizer/core";

if (typeof PointerEvent === "undefined") {
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    pressure: number;
    constructor(type: string, init: MouseEventInit & { pointerId?: number; pointerType?: string; pressure?: number } = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
      this.pressure = init.pressure ?? 0.5;
    }
  }
  Object.defineProperty(globalThis, "PointerEvent", { value: TestPointerEvent });
}
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "./App.js";
import { pendingTickStillApplies } from "./tick-guard.js";

let root: Root | null = null;

beforeEach(() => {
  localStorage.clear();
  window.location.hash = "";
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  document.body.innerHTML = "";
  localStorage.clear();
  window.location.hash = "";
  Reflect.deleteProperty(document, "modelContext");
});

function mount(router?: BrainRouter) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(router ? <App router={router} /> : <App />);
  });
}

function setText(selector: string, value: string) {
  const field = document.querySelector(selector);
  if (!(field instanceof HTMLTextAreaElement)) {
    throw new Error(`Missing ${selector}`);
  }
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  if (!setter) throw new Error("Missing textarea value setter");
  setter.call(field, value);
  act(() => {
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function waitFor(read: () => boolean) {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    if (read()) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(document.body.textContent ?? "timed out");
}

describe("shared cockpit and code mode", () => {
  it("keeps a cockpit edit and the same version after opening code mode", async () => {
    mount();
    expect(document.querySelector(".shell")?.getAttribute("data-mode")).toBe("cockpit");
    expect(document.querySelector(".version")?.textContent).toBe("v0");
    const statement = "Pinned from the visual cockpit.";
    setText('textarea[aria-label="Statement for Freehand canvas sketching"]', statement);
    expect(document.querySelector(".version")?.textContent).toBe("v1");
    const toggle = document.querySelector('button[aria-label="Code Mode"]');
    if (!(toggle instanceof HTMLButtonElement)) throw new Error("Missing Code Mode toggle");
    act(() => {
      toggle.click();
    });
    await waitFor(() => document.querySelector(".shell")?.getAttribute("data-mode") === "code");
    const codeField = document.querySelector(
      'textarea[aria-label="Statement for Freehand canvas sketching"]',
    );
    expect(codeField).toBeInstanceOf(HTMLTextAreaElement);
    if (codeField instanceof HTMLTextAreaElement) expect(codeField.value).toBe(statement);
    expect(document.querySelector(".version")?.textContent).toBe("v2");
    expect(document.querySelector(".log-panel h2")?.textContent).toBe("stateVersion 2");
  });

  it("pauses Build when the statement changes and keeps that statement", async () => {
    mount();
    const build = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Build",
    );
    if (!build) throw new Error("Missing Build");
    act(() => {
      build.click();
    });
    await waitFor(() => document.querySelector(".banner.working") !== null);
    const statement = "Edited while the run was working.";
    setText('textarea[aria-label="Statement for Freehand canvas sketching"]', statement);
    expect(document.querySelector(".shell")?.getAttribute("data-phase")).toBe("paused_by_human");
    expect(document.querySelector(".banner.paused")).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 800));
    const field = document.querySelector(
      'textarea[aria-label="Statement for Freehand canvas sketching"]',
    );
    if (!(field instanceof HTMLTextAreaElement)) throw new Error("Missing statement");
    expect(field.value).toBe(statement);
    expect(document.querySelector(".shell")?.getAttribute("data-phase")).toBe("paused_by_human");
  });

  it("draws a stroke, reloads it, and shows the pin in code mode", () => {
    mount();
    const surface = document.querySelector("svg.sketch-pad");
    if (!(surface instanceof SVGSVGElement)) throw new Error("Missing sketch surface");
    drawOn(surface);
    expect(document.querySelector(".shell")?.getAttribute("data-stroke-count")).toBe("1");
    expect(document.querySelector(".sketch-pad path")?.getAttribute("d")?.length).toBeGreaterThan(8);
    expect(document.body.textContent).toContain("1 stroke pinned to Freehand canvas sketching");
    const stored = localStorage.getItem(workspaceStorageKey);
    act(() => {
      root?.unmount();
    });
    root = null;
    document.body.innerHTML = "";
    expect(stored).toBeTruthy();
    mount();
    expect(document.querySelector(".shell")?.getAttribute("data-stroke-count")).toBe("1");
    expect(document.querySelector(".sketch-pad path")).not.toBeNull();
    const toggle = document.querySelector('button[aria-label="Code Mode"]');
    if (!(toggle instanceof HTMLButtonElement)) throw new Error("Missing Code Mode toggle");
    act(() => {
      toggle.click();
    });
    expect(document.querySelector(".shell")?.getAttribute("data-mode")).toBe("code");
    expect(document.body.textContent).toContain("stroke-2");
    expect(document.body.textContent).toContain("1 stroke pinned to Freehand canvas sketching");
    const clear = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Clear strokes for Freehand canvas sketching",
    );
    if (!clear) throw new Error("Missing clear strokes");
    act(() => {
      clear.click();
    });
    expect(document.querySelector(".shell")?.getAttribute("data-stroke-count")).toBe("0");
    expect(document.body.textContent).toContain("No strokes pinned yet.");
  });

  it("keeps a stroke that pauses a build during a slow judgement", async () => {
    expect(pendingTickStillApplies(1, 1, 4, 4)).toBe(true);
    expect(pendingTickStillApplies(2, 1, 4, 4)).toBe(false);
    expect(pendingTickStillApplies(1, 1, 5, 4)).toBe(false);
    let release: () => void = () => {};
    let started: () => void = () => {};
    const judging = new Promise<void>((resolve) => {
      started = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const router = new BrainRouter({
      prefer: 2,
      tier2: {
        complete: async () => {
          started();
          await held;
          return JSON.stringify({
            route: "freehand-canvas",
            rank: 0.5,
            drift: false,
            reason: "Held for the stroke.",
          });
        },
      },
    });
    mount(router);
    const build = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Build",
    );
    if (!build) throw new Error("Missing Build");
    act(() => {
      build.click();
    });
    await waitFor(() => document.querySelector(".shell")?.getAttribute("data-phase") === "planning");
    await judging;
    const surface = document.querySelector("svg.sketch-pad");
    if (!(surface instanceof SVGSVGElement)) throw new Error("Missing sketch surface");
    drawOn(surface);
    expect(document.querySelector(".shell")?.getAttribute("data-phase")).toBe("paused_by_human");
    expect(document.querySelector(".shell")?.getAttribute("data-stroke-count")).toBe("1");
    release();
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(document.querySelector(".shell")?.getAttribute("data-phase")).toBe("paused_by_human");
    expect(document.querySelector(".shell")?.getAttribute("data-stroke-count")).toBe("1");
    expect(document.querySelector(".sketch-pad path")).not.toBeNull();
  });

  it("promotes a confirmed ledger record into both modes and reloads it", () => {
    mount();
    expect(document.querySelector(".shell")?.getAttribute("data-pulse-count")).toBe("1");
    expect(document.body.textContent).toContain("A stale stateVersion never overwrites the workspace.");
    expect(document.body.textContent).toContain("Outcome not confirmed");
    const promote = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Promote ens-mistake-stale-tick",
    );
    if (!promote) throw new Error("Missing promote");
    act(() => {
      promote.click();
    });
    expect(document.querySelector(".shell")?.getAttribute("data-pulse-count")).toBe("2");
    expect(document.querySelector(".version")?.textContent).toBe("v1");
    expect(document.body.textContent).toContain(
      "Applying a judge tick after a human edit restores the pre-edit workspace.",
    );
    const toggle = document.querySelector('button[aria-label="Code Mode"]');
    if (!(toggle instanceof HTMLButtonElement)) throw new Error("Missing Code Mode toggle");
    act(() => {
      toggle.click();
    });
    expect(document.querySelector(".shell")?.getAttribute("data-mode")).toBe("code");
    expect(document.querySelector(".shell")?.getAttribute("data-lesson-count")).toBe("1");
    expect(document.body.textContent).toContain("Read the card statement before the bridge publish.");
    const stored = localStorage.getItem(workspaceStorageKey);
    act(() => {
      root?.unmount();
    });
    root = null;
    document.body.innerHTML = "";
    expect(stored).toBeTruthy();
    mount();
    expect(document.querySelector(".shell")?.getAttribute("data-pulse-count")).toBe("2");
    expect(document.body.textContent).toContain(
      "Applying a judge tick after a human edit restores the pre-edit workspace.",
    );
  });

  it("hydrates a pre-memory workspace without inventing pulse records", () => {
    const raw = localStorage.getItem(workspaceStorageKey);
    expect(raw).toBeNull();
    mount();
    const stored = localStorage.getItem(workspaceStorageKey);
    if (!stored) throw new Error("Missing stored workspace");
    const legacy = JSON.parse(stored) as Record<string, unknown>;
    delete legacy.ensemblyLedger;
    delete legacy.pulseMemory;
    delete legacy.workflowLessons;
    legacy.stateVersion = 4;
    const cards = legacy.problemCards as Array<{ id: string; statement: string }>;
    const canvas = cards.find((card) => card.id === "card-canvas");
    if (!canvas) throw new Error("Missing canvas card");
    canvas.statement = "Kept from main.";
    localStorage.setItem(workspaceStorageKey, JSON.stringify(legacy));
    act(() => {
      root?.unmount();
    });
    root = null;
    document.body.innerHTML = "";
    mount();
    expect(document.querySelector(".shell")?.getAttribute("data-pulse-count")).toBe("0");
    expect(document.querySelector(".shell")?.getAttribute("data-lesson-count")).toBe("0");
    expect(document.querySelector(".version")?.textContent).toBe("v4");
    const field = document.querySelector('textarea[aria-label="Statement for Freehand canvas sketching"]');
    expect(field).toBeInstanceOf(HTMLTextAreaElement);
    if (field instanceof HTMLTextAreaElement) expect(field.value).toBe("Kept from main.");
    expect(document.body.textContent).toContain("No promoted records yet.");
  });

  it("shows the WebMCP strip with the sketch pad and the memory panel", async () => {
    mount();
    await waitFor(
      () => document.querySelector("[data-webmcp-source]")?.getAttribute("data-webmcp-source") === "local",
    );
    expect(document.querySelector(".webmcp-mode")?.textContent).toBe("Local bridge");
    expect(document.querySelector("[data-tool='list_cards']")).not.toBeNull();
    expect(document.querySelector(".sketch-pad")).not.toBeNull();
    expect(document.querySelector(".memory-panel")).not.toBeNull();
    expect(document.body.textContent).toContain("Ensembly shared log");
    expect(document.body.textContent).toContain("Pulse Memory");
    expect(document.querySelector("[data-pulse-schema]")?.getAttribute("data-pulse-schema")).toBe(
      "pulse-pack-v1",
    );
    expect(document.body.textContent).toContain("user-stated");
    expect(document.querySelector("[data-tool='read_pulse_inject']")).not.toBeNull();
  });

  it("registers on document.modelContext and clears the tools on unmount", async () => {
    const host = createLocalModelContext();
    Object.defineProperty(document, "modelContext", { configurable: true, value: host });
    mount();
    await waitFor(() => host.listNames().length === 8);
    expect(document.querySelector(".webmcp-mode")?.textContent).toBe("Native WebMCP");
    act(() => {
      root?.unmount();
    });
    root = null;
    expect(host.listNames()).toHaveLength(0);
  });
});

function drawOn(surface: SVGSVGElement) {
  surface.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 128,
      width: 200,
      height: 128,
      toJSON() {
        return {};
      },
    }) as DOMRect;
  const fire = (type: string, x: number, y: number) => {
    surface.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: "mouse",
        buttons: type === "pointerup" ? 0 : 1,
      }),
    );
  };
  act(() => {
    fire("pointerdown", 24, 36);
    fire("pointermove", 90, 48);
    fire("pointermove", 140, 88);
    fire("pointerup", 160, 70);
  });
}
