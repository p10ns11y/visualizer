import { Button } from "@ui-sdk/react/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@ui-sdk/react/collapsible";
import {
  emptyDesign,
  openGaps,
  stageLabel,
  viewFor,
  type Answers,
  type Design,
  type FlowState,
  type QuestionId,
  type ViewNode,
} from "@visualizer/core";
import { AskView } from "./ask-view.js";
import { StageMark } from "./stage-mark.js";

function ViewNodeView({
  node,
  stage,
  answers,
  design,
  onAnswer,
}: {
  node: ViewNode;
  stage: FlowState["stage"];
  answers: Answers;
  design: Design;
  onAnswer: (id: QuestionId, value: string) => void;
}) {
  switch (node.kind) {
    case "stage-mark":
      return <StageMark stage={stage}>{stageLabel(stage)}</StageMark>;
    case "ask":
      return <AskView answers={answers} gaps={openGaps(answers, design)} onAnswer={onAnswer} />;
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

export function StageView({
  flow,
  answers,
  design = emptyDesign,
  onAnswer,
}: {
  flow: FlowState;
  answers: Answers;
  design?: Design;
  onAnswer: (id: QuestionId, value: string) => void;
}) {
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
        <ViewNodeView
          key={node.kind}
          node={node}
          stage={spec.stage}
          answers={answers}
          design={design}
          onAnswer={onAnswer}
        />
      ))}
    </section>
  );
}
