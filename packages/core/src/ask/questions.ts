export const questions = [
  {
    id: "what",
    prompt: "What are you making?",
    options: [
      { value: "website", label: "Website" },
      { value: "webApp", label: "Web app" },
      { value: "saas", label: "SaaS" },
      { value: "game", label: "Game" },
      { value: "three", label: "Three.js" },
      { value: "mobile", label: "Mobile" },
    ],
  },
  {
    id: "who",
    prompt: "Who is it for?",
    options: [
      { value: "justMe", label: "Just me" },
      { value: "users", label: "Users" },
    ],
  },
  {
    id: "hold",
    prompt: "What should it hold?",
    options: [
      { value: "nothing", label: "Nothing yet" },
      { value: "files", label: "Files" },
      { value: "records", label: "Records" },
    ],
  },
  {
    id: "reach",
    prompt: "How do people open it?",
    options: [
      { value: "page", label: "A page" },
      { value: "install", label: "An install" },
    ],
  },
] as const;

export type Question = (typeof questions)[number];
export type QuestionId = Question["id"];

type OptionsFor<Id extends QuestionId> = Extract<Question, { id: Id }>["options"][number]["value"];

export type WhatKind = OptionsFor<"what">;
export type WhoKind = OptionsFor<"who">;
export type HoldKind = OptionsFor<"hold">;
export type ReachKind = OptionsFor<"reach">;

export type Answers = {
  readonly what?: WhatKind;
  readonly who?: WhoKind;
  readonly hold?: HoldKind;
  readonly reach?: ReachKind;
};

export const questionIds = questions.map((question) => question.id);

function hasOption(id: QuestionId, value: string): boolean {
  for (const question of questions) {
    if (question.id !== id) continue;
    for (const option of question.options) {
      if (option.value === value) return true;
    }
  }
  return false;
}

export function answerQuestion(answers: Answers, id: QuestionId, value: string): Answers {
  if (!hasOption(id, value)) return answers;
  switch (id) {
    case "what":
      return { ...answers, what: value as WhatKind };
    case "who":
      return { ...answers, who: value as WhoKind };
    case "hold":
      return { ...answers, hold: value as HoldKind };
    case "reach":
      return { ...answers, reach: value as ReachKind };
    default: {
      const unreachable: never = id;
      return unreachable;
    }
  }
}

export function encodeAnswers(answers: Answers): string {
  const parts: string[] = [];
  for (const question of questions) {
    const value = answers[question.id];
    if (value !== undefined) parts.push(`${question.id}=${value}`);
  }
  return parts.join(",");
}
