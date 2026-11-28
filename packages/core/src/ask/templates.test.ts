import { describe, expect, it } from "vitest";
import { questions, type WhatKind } from "./questions.js";
import { templateFor, templates } from "./templates.js";

const whatOptions = questions.find((question) => question.id === "what")?.options ?? [];

describe("wireframe templates", () => {
  it("keeps one template for each what answer", () => {
    expect(whatOptions.length).toBeGreaterThan(0);
    const titles = whatOptions.map((option) => templateFor(option.value as WhatKind).title);
    expect(new Set(titles).size).toBe(titles.length);
    expect(Object.keys(templates).sort()).toEqual(whatOptions.map((option) => option.value).sort());
    for (const option of whatOptions) {
      const template = templateFor(option.value as WhatKind);
      expect(template.what).toBe(option.value);
      expect(template.nodes.length).toBeGreaterThan(0);
      expect(templates[option.value as WhatKind]).toEqual(template);
    }
  });
});
