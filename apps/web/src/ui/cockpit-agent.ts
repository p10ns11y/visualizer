import { createAgent } from "@ui-sdk/react/agent";
import type { UiControlSnapshot } from "@visualizer/core";

const agent = createAgent({
  allow: () => false,
});

export function uiControlSnapshot(): UiControlSnapshot[] {
  return agent.snapshot().map((entry) => ({
    ref: entry.ref,
    component: entry.component,
    ...(entry.label ? { label: entry.label } : {}),
    actions: [...entry.actions],
  }));
}

export async function actOnUiControl(ref: string, action: string): Promise<{ ok: boolean }> {
  const result = await agent.act({ steps: [{ ref, action }] });
  return { ok: result.ok };
}
