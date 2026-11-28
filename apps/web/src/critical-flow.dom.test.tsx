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
    Element.prototype.getAnimations = () => [];
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
    expect(shellScreen.shows).toEqual(["stage", "view", "log"]);
    expect(document.querySelector("h1")?.textContent).toBe("Visualizer");
    expect(document.querySelector("[data-stage]")?.textContent).toBe(stageLine({
      stage: "asking",
      motion: "live",
      mode: "simple",
    }));
    expect(document.querySelectorAll("[data-log]")).toHaveLength(1);
    expect(document.querySelectorAll("[data-log] li")).toHaveLength(0);
    expect(document.querySelectorAll("main")).toHaveLength(1);
    expect(document.querySelectorAll("[data-view]")).toHaveLength(1);
    expect(document.querySelector("[data-view]")?.getAttribute("data-view")).toBe("asking");
    expect(document.querySelector("[data-view]")?.getAttribute("data-mode")).toBe("simple");
    expect(document.querySelector("[data-view]")?.getAttribute("data-panel")).toBeNull();
    expect(document.querySelector("[data-stage-mark]")?.getAttribute("data-stage-mark")).toBe("asking");
    expect(document.querySelector("[data-ask]")?.textContent).toContain("What are you making?");
    expect(document.querySelector("[data-preview]")?.getAttribute("data-preview")).toBe("empty");
    expect(document.querySelectorAll("[data-gap]")).toHaveLength(0);
    expect([...document.querySelectorAll("button")].some((item) => item.textContent === "Advanced")).toBe(
      false,
    );
    click("Start");
    expect(document.querySelector("[data-stage]")?.getAttribute("data-stage")).toBe("editing");
    expect(document.querySelector("[data-view]")?.getAttribute("data-view")).toBe("editing");
    expect(document.querySelector("[data-view]")?.textContent).toContain("Preview");
    expect(document.querySelector("[data-ask]")).toBeNull();
    expect(document.querySelectorAll("[data-view]")).toHaveLength(1);
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
    click("Settings");
    click("Advanced");
    click("Close");
    expect(document.querySelector("[data-mode]")?.getAttribute("data-mode")).toBe("advanced");
    expect(document.querySelector("[data-view]")?.getAttribute("data-panel")).toBe("later");
    expect(document.querySelector("[data-view]")?.textContent).toContain("later");
    expect(document.querySelector("[data-view]")?.getAttribute("data-view")).toBe("editing");
    click("Stop");
    expect(document.querySelector("[data-stage]")?.getAttribute("data-stage")).toBe("done");
    expect(document.querySelector("[data-view]")?.getAttribute("data-view")).toBe("done");
    expect(document.querySelector("[data-view]")?.textContent).toContain("Done");
    expect(button("Start").disabled).toBe(true);
    expect(button("Pause").disabled).toBe(true);
    expect(button("Stop").disabled).toBe(true);
    expect(document.querySelectorAll("[data-log] li")).toHaveLength(4);
    click("Reset");
    expect(document.querySelector("[data-stage]")?.getAttribute("data-stage")).toBe("asking");
    expect(document.querySelector("[data-motion]")?.getAttribute("data-motion")).toBe("live");
    expect(document.querySelector("[data-mode]")?.getAttribute("data-mode")).toBe("simple");
    expect(document.querySelector("[data-view]")?.getAttribute("data-view")).toBe("asking");
    expect(document.querySelector("[data-view]")?.getAttribute("data-panel")).toBeNull();
    expect(document.querySelector("[data-ask]")?.textContent).toContain("What are you making?");
    expect(document.querySelectorAll("[data-log] li")).toHaveLength(5);
    expect(document.querySelectorAll("[data-log] li").item(4).textContent).toContain("RESET ");
  });

  function choose(name: string) {
    const label = [...document.querySelectorAll("[data-choice]")].find(
      (item) => item.textContent?.trim() === name,
    );
    const target = label?.querySelector("[role='radio'], button");
    if (!(target instanceof HTMLElement)) throw new Error(`Missing ${name}`);
    act(() => {
      target.click();
    });
  }

  function gapIds(): string[] {
    return [...document.querySelectorAll("[data-gap]")].map(
      (item) => item.getAttribute("data-gap") ?? "",
    );
  }

  it("CF-02 answers change the preview and the gap cards", () => {
    render();
    expect(document.querySelectorAll("main[data-screen]")).toHaveLength(1);
    expect(document.querySelector("main")?.getAttribute("data-scroll")).toBe("false");
    expect(document.querySelector("[data-preview]")?.getAttribute("data-preview")).toBe("empty");
    expect(gapIds()).toEqual([]);
    expect(document.querySelectorAll("[data-log] li")).toHaveLength(0);
    choose("Website");
    expect(document.querySelector("[data-preview]")?.getAttribute("data-preview")).toBe("website");
    expect(document.querySelector("[data-wire]")?.textContent).toContain("Read");
    expect(document.querySelector("[data-answers]")?.getAttribute("data-answers")).toBe("what=website");
    expect(gapIds()).toEqual(["hosting"]);
    expect(document.querySelectorAll("[data-log] li")).toHaveLength(0);
    choose("Users");
    expect(gapIds()).toEqual(["auth", "hosting"]);
    expect(document.querySelector("[data-answers]")?.getAttribute("data-answers")).toBe(
      "what=website,who=users",
    );
    choose("SaaS");
    expect(document.querySelector("[data-preview]")?.getAttribute("data-preview")).toBe("saas");
    expect(document.querySelector("[data-wire]")?.textContent).toContain("Invite");
    expect(gapIds()).toEqual(["dataSource", "auth", "hosting"]);
    expect(document.querySelectorAll("[data-log] li")).toHaveLength(0);
    expect(document.querySelector("[data-stage]")?.getAttribute("data-stage")).toBe("asking");
  });
});