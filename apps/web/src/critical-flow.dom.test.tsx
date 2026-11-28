import { bareShell } from "@visualizer/core/shell";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "./App.js";

describe("bare shell", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it("CF-01 renders one empty screen", () => {
    act(() => {
      root.render(<App />);
    });
    const screens = document.querySelectorAll("main[data-screen]");
    expect(screens).toHaveLength(1);
    expect(screens[0]?.getAttribute("data-screen")).toBe(bareShell.screens[0]);
    expect(screens[0]?.getAttribute("data-scroll")).toBe("false");
    expect(bareShell.scroll).toBe(false);
    expect(document.querySelector("h1")?.textContent).toBe("Visualizer");
    expect(document.querySelectorAll("ul, ol, section, article")).toHaveLength(0);
  });
});
