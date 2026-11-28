import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allowComponentAction, stageMarkName } from "./allow.js";
import { agent, connectModelContext } from "./agent.js";
import { App } from "./App.js";

type RegisteredTool = {
  name: string;
  execute: (input: object) => Promise<unknown>;
};

function installHost() {
  const tools = new Map<string, RegisteredTool>();
  const registerTool = vi.fn(async (tool: RegisteredTool) => {
    tools.set(tool.name, tool);
  });
  Object.assign(document, { modelContext: { registerTool } });
  return { tools, registerTool };
}

function clearHost() {
  delete (document as { modelContext?: unknown }).modelContext;
}

function liveStage(components: readonly { component: string; offPage?: boolean; stage?: unknown }[]) {
  return components.find((item) => item.component === stageMarkName && item.offPage !== true);
}

describe("component allow", () => {
  it("accepts component actions and refuses the stage mark", () => {
    expect(allowComponentAction({ component: "button", action: "press" })).toBe(true);
    expect(allowComponentAction({ component: "collapsible", action: "setOpen" })).toBe(true);
    expect(allowComponentAction({ component: "button", action: "START" })).toBe(false);
    expect(allowComponentAction({ component: stageMarkName, action: "setStage" })).toBe(false);
    expect(allowComponentAction({ component: stageMarkName, action: "press" })).toBe(false);
  });
});

describe("bridge", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    clearHost();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    clearHost();
  });

  function render() {
    act(() => {
      root.render(<App />);
    });
  }

  it("reads stage from the bridge when registerTool is missing", async () => {
    const release = connectModelContext({});
    expect(release()).toBeUndefined();
    render();
    const listed = agent.snapshot();
    expect(liveStage(listed)?.stage).toBe("asking");
    const found = await agent.query({ kind: stageMarkName });
    expect(Array.isArray(found)).toBe(true);
    if (!Array.isArray(found)) return;
    expect(liveStage(found)?.stage).toBe("asking");
    const pressed = await agent.act({
      steps: [{ ref: "Questions", action: "press" }],
    });
    expect(pressed.ok).toBe(true);
    expect(liveStage(agent.snapshot())?.stage).toBe("asking");
    const refused = await agent.act({
      steps: [{ ref: "asking", action: "setStage", args: ["done"] }],
    });
    expect(refused.ok).toBe(false);
    expect(liveStage(agent.snapshot())?.stage).toBe("asking");
    expect(document.querySelector("[data-stage]")?.getAttribute("data-stage")).toBe("asking");
  });

  it("registers snapshot, act, and query when registerTool exists", async () => {
    const { tools, registerTool } = installHost();
    render();
    expect(registerTool).toHaveBeenCalledTimes(3);
    expect([...tools.keys()].sort()).toEqual(["act", "query", "snapshot"]);
    const listed = await tools.get("snapshot")?.execute({});
    expect(liveStage(listed as { component: string; stage?: unknown }[])?.stage).toBe("asking");
    expect(listed).toEqual(agent.snapshot());
    const refused = await tools.get("act")?.execute({
      steps: [{ ref: "asking", action: "setStage", args: ["done"] }],
    });
    expect(refused).toMatchObject({ ok: false });
    expect(document.querySelector("[data-stage-mark]")?.getAttribute("data-stage-mark")).toBe("asking");
  });
});
