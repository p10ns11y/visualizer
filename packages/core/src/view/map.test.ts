import { describe, expect, it } from "vitest";
import { flowModes, flowStages } from "../flow/schema.js";
import { viewFor, viewMap } from "./map.js";

describe("view map", () => {
  it("has one spec for every mode and stage", () => {
    expect(Object.keys(viewMap).sort()).toEqual([...flowModes].sort());
    for (const mode of flowModes) {
      expect(Object.keys(viewMap[mode]).sort()).toEqual([...flowStages].sort());
      for (const stage of flowStages) {
        const spec = viewFor(mode, stage);
        expect(spec).toEqual(viewMap[mode][stage]);
        expect(spec.mode).toBe(mode);
        expect(spec.stage).toBe(stage);
        expect(spec.nodes[0]).toEqual({ kind: "stage-mark" });
        expect(spec.nodes[1]?.kind).toBe("button");
      }
    }
  });

  it("gives each stage its own placeholder and adds later only in advanced mode", () => {
    const labels = flowStages.map((stage) => {
      const node = viewFor("simple", stage).nodes[1];
      if (node?.kind !== "button") throw new Error(`Missing placeholder for ${stage}`);
      return node.label;
    });
    expect(new Set(labels).size).toBe(flowStages.length);
    expect(labels).toEqual(["Questions", "Preview", "Tools", "Build", "Done"]);
    for (const stage of flowStages) {
      const simple = viewFor("simple", stage);
      const advanced = viewFor("advanced", stage);
      expect(simple.nodes.some((node) => node.kind === "collapsible")).toBe(false);
      expect(advanced.nodes.slice(0, simple.nodes.length)).toEqual([...simple.nodes]);
      expect(advanced.nodes.at(-1)).toEqual({ kind: "collapsible", label: "later" });
    }
  });
});
