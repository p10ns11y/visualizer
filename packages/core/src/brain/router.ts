import { readJudgementStream } from "./stream.js";
import {
  JudgementSchema,
  type Judgement,
  type ProblemCard,
  type MockupNode,
} from "../state/schema.js";

export type BrainInput = {
  cards: Pick<ProblemCard, "title" | "statement">[];
  mockups: Pick<MockupNode, "title">[];
};

export interface LocalDecisionClient {
  complete(prompt: string): Promise<string>;
}

export interface FrontierClient {
  synthesize(prompt: string): Promise<string>;
}

export type BrainTier = 1 | 2 | 3;

const skillRules: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: "freehand-canvas", pattern: /sketch|canvas|freehand|stroke/i },
  { id: "webmcp-bridge", pattern: /webmcp|modelcontext|bridge/i },
  { id: "board-log", pattern: /sqlite|board|event log/i },
];

export function tier1Judge(input: BrainInput): Judgement {
  const corpus = input.cards.map((card) => `${card.title} ${card.statement}`).join(" \n ");
  const hits = skillRules.filter((rule) => rule.pattern.test(corpus));
  const drift = input.cards.some((card) => {
    const words = card.title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3);
    return !input.mockups.some((mockup) =>
      words.some((word) => mockup.title.toLowerCase().includes(word)),
    );
  });
  const route = hits.map((hit) => hit.id).join("+") || "schema-check";
  return JudgementSchema.parse({
    tier: 1,
    route,
    rank: Number((hits.length / skillRules.length).toFixed(2)),
    drift,
    reason: drift
      ? "A problem card has no mockup anchor."
      : "Cards, mockups, and schema checks line up.",
  });
}

function promptFor(input: BrainInput): string {
  return [
    "Return one JSON object with keys route, rank, drift, reason.",
    "rank is a number from 0 to 1. drift is a boolean.",
    "route names the skills to run. reason is one short sentence.",
    JSON.stringify({
      cards: input.cards.map((card) => card.title),
      mockups: input.mockups.map((mockup) => mockup.title),
    }),
  ].join("\n");
}

function degradation(prefer: BrainTier): BrainTier[] {
  if (prefer === 1) return [1];
  if (prefer === 2) return [2, 1];
  return [3, 2, 1];
}

async function judgementFromModelText(text: string, tier: 2 | 3): Promise<Judgement> {
  async function* once() {
    yield text;
  }
  const parsed = await readJudgementStream(once());
  return JudgementSchema.parse({ ...parsed, tier });
}

export class BrainRouter {
  constructor(
    private readonly options: {
      prefer?: BrainTier;
      tier1?: (input: BrainInput) => Judgement;
      tier2?: LocalDecisionClient;
      tier3?: FrontierClient;
    } = {},
  ) {}

  async judge(input: BrainInput): Promise<Judgement> {
    const prefer = this.options.prefer ?? 3;
    for (const tier of degradation(prefer)) {
      try {
        if (tier === 3) {
          if (!this.options.tier3) continue;
          const text = await this.options.tier3.synthesize(promptFor(input));
          return await judgementFromModelText(text, 3);
        }
        if (tier === 2) {
          if (!this.options.tier2) continue;
          const text = await this.options.tier2.complete(promptFor(input));
          return await judgementFromModelText(text, 2);
        }
        const judge = this.options.tier1 ?? tier1Judge;
        return JudgementSchema.parse({ ...judge(input), tier: 1 });
      } catch {
        continue;
      }
    }
    return JudgementSchema.parse({ ...tier1Judge(input), tier: 1 });
  }
}
