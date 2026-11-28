import type { WhatKind } from "./questions.js";

export type FrameNode =
  | { kind: "toolbar"; label: string; items: readonly string[] }
  | { kind: "tabs"; label: string; tabs: readonly { value: string; label: string; panel: string }[] }
  | { kind: "input"; label: string }
  | { kind: "button"; label: string }
  | { kind: "separator" }
  | { kind: "meter"; label: string; value: number };

export type WireframeTemplate = {
  what: WhatKind;
  title: string;
  nodes: readonly FrameNode[];
};

export const templates = {
  website: {
    what: "website",
    title: "Page",
    nodes: [
      { kind: "toolbar", label: "Site", items: ["Home", "Journal", "About"] },
      { kind: "separator" },
      { kind: "button", label: "Read" },
    ],
  },
  webApp: {
    what: "webApp",
    title: "App",
    nodes: [
      { kind: "toolbar", label: "App", items: ["Inbox", "Tasks"] },
      { kind: "input", label: "Find" },
      { kind: "button", label: "Open" },
    ],
  },
  saas: {
    what: "saas",
    title: "Workspace",
    nodes: [
      { kind: "toolbar", label: "Workspace", items: ["Home"] },
      {
        kind: "tabs",
        label: "Sections",
        tabs: [
          { value: "overview", label: "Overview", panel: "Usage" },
          { value: "billing", label: "Billing", panel: "Plan" },
          { value: "team", label: "Team", panel: "People" },
        ],
      },
      { kind: "button", label: "Invite" },
    ],
  },
  game: {
    what: "game",
    title: "Play field",
    nodes: [
      { kind: "meter", label: "Score", value: 40 },
      { kind: "button", label: "Play" },
    ],
  },
  three: {
    what: "three",
    title: "Scene",
    nodes: [
      { kind: "toolbar", label: "Scene", items: ["Scene", "Camera", "Light"] },
      { kind: "button", label: "Orbit" },
    ],
  },
  mobile: {
    what: "mobile",
    title: "Handset",
    nodes: [
      { kind: "button", label: "Today" },
      { kind: "button", label: "Library" },
      { kind: "button", label: "Account" },
    ],
  },
} as const satisfies Record<WhatKind, WireframeTemplate>;

export function templateFor(what: WhatKind): WireframeTemplate {
  return templates[what];
}
