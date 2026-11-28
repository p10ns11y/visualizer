import type { AgentAction } from "@ui-sdk/react/agent";

const componentActions = new Set<string>([
  "press",
  "setValue",
  "setOpen",
  "setChecked",
  "setPressed",
  "open",
  "close",
  "toggle",
  "select",
  "clear",
  "next",
  "previous",
  "first",
  "last",
  "play",
  "pause",
  "show",
  "hide",
  "expand",
  "collapse",
  "increment",
  "decrement",
  "reset",
  "submit",
  "add",
  "remove",
  "insert",
]);

export const stageMarkName = "stage-mark";

export function allowComponentAction(step: Pick<AgentAction, "action" | "component">): boolean {
  if (step.component === stageMarkName) return false;
  return componentActions.has(step.action);
}
