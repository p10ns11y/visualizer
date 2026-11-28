import { logLine, shellScreen, stageLine } from "@visualizer/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "./App.js";

function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === name,
  );
  if (!(found instanceof HTMLButtonElement)) throw new Error(`Missing ${name}`);
  return found;
}

describe("flow screen", () => {
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

  function render() {
    act(() => {
      root.render(<App />);
    });
  }

  function click(name: string) {
    act(() => {
      button(name).click();
    });
  }

  it("CF-01 renders the stage and the event log", () => {
    render();
    const screens = document.querySelectorAll("main[data-screen]");
    expect(screens).toHaveLength(1);
    expect(screens[0]?.getAttribute("data-screen")).toBe(shellScreen.screens[0]);
    expect(screens[0]?.getAttribute("data-scroll")).toBe("false");
    expect(shellScreen.scroll).toBe(false);
    expect(shellScreen.shows).toEqual(["stage", "log"]);
    expect(document.querySelector("h1")?.textContent).toBe("Visualizer");
    expect(document.querySelector("[data-stage]")?.textContent).toBe(stageLine({
      stage: "asking",
      motion: "live",
      mode: "simple",
    }));
    expect(document.querySelectorAll("[data-log]")).toHaveLength(1);
    expect(document.querySelectorAll("[data-log] li")).toHaveLength(0);
    expect(document.querySelectorAll("main")).toHaveLength(1);
    click("Start");
    expect(document.querySelector("[data-stage]")?.getAttribute("data-stage")).toBe("editing");
    const lines = [...document.querySelectorAll("[data-log] li")].map((item) => item.textContent);
    expect(lines).toEqual([logLine({
      id: "log-1",
      stateVersion: 1,
      type: "START",
      fromStage: "asking",
      toStage: "editing",
      fromMotion: "live",
      toMotion: "live",
      fromMode: "simple",
      toMode: "simple",
    })]);
    click("Pause");
    expect(document.querySelector("[data-motion]")?.getAttribute("data-motion")).toBe("paused");
    click("Advanced");
    expect(document.querySelector("[data-mode]")?.getAttribute("data-mode")).toBe("advanced");
    click("Stop");
    expect(document.querySelector("[data-stage]")?.getAttribute("data-stage")).toBe("done");
    expect(button("Start").disabled).toBe(true);
    expect(button("Pause").disabled).toBe(true);
    expect(button("Stop").disabled).toBe(true);
    expect(document.querySelectorAll("[data-log] li")).toHaveLength(4);
  });
});