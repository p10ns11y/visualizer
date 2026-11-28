import { Button } from "@ui-sdk/react/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@ui-sdk/react/collapsible";
import { stageLabel, viewFor, type FlowState, type ViewNode } from "@visualizer/core";
import { StageMark } from "./stage-mark.js";

function ViewNodeView({ node, stage }: { node: ViewNode; stage: FlowState["stage"] }) {
  switch (node.kind) {
    case "stage-mark":
      return <StageMark stage={stage}>{stageLabel(stage)}</StageMark>;
    case "button":
      return <Button onClick={() => undefined}>{node.label}</Button>;
    case "collapsible":
      return (
        <Collapsible className="later" defaultOpen aria-label={node.label}>
          <CollapsibleTrigger>{node.label}</CollapsibleTrigger>
          <CollapsiblePanel>{node.label}</CollapsiblePanel>
        </Collapsible>
      );
    default: {
      const unreachable: never = node;
      return unreachable;
    }
  }
}

export function StageView({ flow }: { flow: FlowState }) {
  const spec = viewFor(flow.mode, flow.stage);
  const later = spec.nodes.some((node) => node.kind === "collapsible");
  return (
    <section
      className="view"
      data-view={spec.stage}
      data-mode={spec.mode}
      data-panel={later ? "later" : undefined}
    >
      {spec.nodes.map((node) => (
        <ViewNodeView key={node.kind} node={node} stage={spec.stage} />
      ))}
    </section>
  );
}
