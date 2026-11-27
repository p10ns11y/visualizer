import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App.js";

let root: Root | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  document.body.innerHTML = "";
});

function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(<App />);
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
});
