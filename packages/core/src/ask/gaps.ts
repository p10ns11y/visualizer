import {
  questions,
  type Answers,
  type HoldKind,
  type QuestionId,
  type ReachKind,
  type WhatKind,
  type WhoKind,
} from "./questions.js";

export const decisionIds = ["dataSource", "auth", "hosting", "distribution"] as const;
export type DecisionId = (typeof decisionIds)[number];

export const decisionLabel = {
  dataSource: "Data source",
  auth: "Auth",
  hosting: "Hosting",
  distribution: "Distribution",
} as const satisfies Record<DecisionId, string>;

export type Gap = {
  id: DecisionId;
  label: string;
};

export type Design = {
  readonly settled: readonly DecisionId[];
};

export const emptyDesign: Design = { settled: [] };

export const gapRules = {
  what: {
    website: ["hosting"],
    webApp: ["dataSource", "hosting"],
    saas: ["dataSource", "auth", "hosting"],
    game: ["hosting"],
    three: ["hosting"],
    mobile: ["distribution"],
  },
  who: {
    justMe: [],
    users: ["auth"],
  },
  hold: {
    nothing: [],
    files: ["dataSource"],
    records: ["dataSource", "auth"],
  },
  reach: {
    page: ["hosting"],
    install: ["distribution"],
  },
} as const satisfies {
  what: Record<WhatKind, readonly DecisionId[]>;
  who: Record<WhoKind, readonly DecisionId[]>;
  hold: Record<HoldKind, readonly DecisionId[]>;
  reach: Record<ReachKind, readonly DecisionId[]>;
};

function decisionsFor(answers: Answers, id: QuestionId): readonly DecisionId[] {
  switch (id) {
    case "what":
      return answers.what === undefined ? [] : gapRules.what[answers.what];
    case "who":
      return answers.who === undefined ? [] : gapRules.who[answers.who];
    case "hold":
      return answers.hold === undefined ? [] : gapRules.hold[answers.hold];
    case "reach":
      return answers.reach === undefined ? [] : gapRules.reach[answers.reach];
    default: {
      const unreachable: never = id;
      return unreachable;
    }
  }
}

export function openGaps(answers: Answers, design: Design): Gap[] {
  const required = new Set<DecisionId>();
  for (const question of questions) {
    for (const decision of decisionsFor(answers, question.id)) required.add(decision);
  }
  const settled = new Set(design.settled);
  return decisionIds
    .filter((id) => required.has(id) && !settled.has(id))
    .map((id) => ({ id, label: decisionLabel[id] }));
}

export function encodeGaps(gaps: readonly Gap[]): string {
  return gaps.map((gap) => gap.id).join(",");
}
