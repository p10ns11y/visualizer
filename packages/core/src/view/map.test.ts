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
        expect(spec.nodes[1]?.kind).toBe(stage === "asking" ? "ask" : "button");
      }
    }
  });

  it("gives asking an ask region and keeps a placeholder for the other stages", () => {
    expect(viewFor("simple", "asking").nodes[1]).toEqual({ kind: "ask" });
    const labels = flowStages.flatMap((stage) => {
      const node = viewFor("simple", stage).nodes[1];
      return node?.kind === "button" ? [node.label] : [];
    });
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toEqual(["Preview", "Tools", "Build", "Done"]);
    for (const stage of flowStages) {
      const simple = viewFor("simple", stage);
      const advanced = viewFor("advanced", stage);
      expect(simple.nodes.some((node) => node.kind === "collapsible")).toBe(false);
      expect(advanced.nodes.slice(0, simple.nodes.length)).toEqual([...simple.nodes]);
      expect(advanced.nodes.at(-1)).toEqual({ kind: "collapsible", label: "later" });
    }
  });
});
