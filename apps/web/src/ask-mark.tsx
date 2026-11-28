import { definePrimitive } from "@ui-sdk/core";
import { createParts } from "@ui-sdk/react/primitive";
import { askMarkName } from "./allow.js";

type AskMarkOptions = { answers?: string; gaps?: string };

const askMark = definePrimitive({
  name: askMarkName,
  options: { answers: "string", gaps: "string" },
  state: (options: AskMarkOptions) => ({
    answers: options.answers ?? "",
    gaps: options.gaps ?? "",
  }),
  controlled: ["answers", "gaps"],
  sync: (options: AskMarkOptions) => ({
    answers: options.answers ?? "",
    gaps: options.gaps ?? "",
  }),
  api: () => ({}),
  agent: { actions: [] },
  slots: (slot) => ({
    root: slot<{}, { answers: string; gaps: string }>({
      state: (state) => ({ answers: state.answers, gaps: state.gaps }),
      attrs: (state) => ({
        role: "status",
        "aria-label": state.gaps === "" ? "No open gaps" : "Open gaps",
        "data-answers": state.answers,
        "data-gaps": state.gaps,
      }),
    }),
  }),
});

const askMarkParts = createParts(askMark, { root: "p" });

export const AskMark = askMarkParts.Root;
