import { describe, expect, it } from "vitest";
import { emptyDesign, encodeGaps, gapRules, openGaps, type DecisionId } from "./gaps.js";
import { answerQuestion, encodeAnswers, questions, type Answers, type QuestionId } from "./questions.js";

function alone(id: QuestionId, value: string): Answers {
  return answerQuestion({}, id, value);
}

function ids(answers: Answers, design = emptyDesign): DecisionId[] {
  return openGaps(answers, design).map((gap) => gap.id);
}

describe("gap rules", () => {
  it("maps each answer to its gap set", () => {
    const expected: Record<string, DecisionId[]> = {
      website: ["hosting"],
      webApp: ["dataSource", "hosting"],
      saas: ["dataSource", "auth", "hosting"],
      game: ["hosting"],
      three: ["hosting"],
      mobile: ["distribution"],
      justMe: [],
      users: ["auth"],
      nothing: [],
      files: ["dataSource"],
      records: ["dataSource", "auth"],
      page: ["hosting"],
      install: ["distribution"],
    };
    const seen = new Set<string>();
    for (const question of questions) {
      for (const option of question.options) {
        seen.add(option.value);
        expect(ids(alone(question.id, option.value)), option.value).toEqual(expected[option.value]);
        expect(gapRules[question.id][option.value as never]).toEqual(expected[option.value]);
      }
    }
    expect([...seen].sort()).toEqual(Object.keys(expected).sort());
  });

  it("unions answers and drops decisions the design already settled", () => {
    expect(ids({})).toEqual([]);
    const answers = answerQuestion(
      answerQuestion(
        answerQuestion(answerQuestion({}, "what", "website"), "who", "users"),
        "hold",
        "files",
      ),
      "reach",
      "install",
    );
    expect(ids(answers)).toEqual(["dataSource", "auth", "hosting", "distribution"]);
    expect(encodeAnswers(answers)).toBe("what=website,who=users,hold=files,reach=install");
    expect(encodeGaps(openGaps(answers, emptyDesign))).toBe("dataSource,auth,hosting,distribution");
    expect(ids(answers, { settled: ["auth", "hosting"] })).toEqual(["dataSource", "distribution"]);
    expect(answerQuestion(answers, "what", "nope")).toEqual(answers);
  });
});
