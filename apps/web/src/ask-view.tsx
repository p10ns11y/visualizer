import { Field, FieldLabel } from "@ui-sdk/react/field";
import { Input } from "@ui-sdk/react/input";
import { Meter, MeterIndicator, MeterLabel, MeterTrack, MeterValue } from "@ui-sdk/react/meter";
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/react/radio";
import { Separator } from "@ui-sdk/react/separator";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import { Toolbar, ToolbarButton } from "@ui-sdk/react/toolbar";
import { Button } from "@ui-sdk/react/button";
import {
  encodeAnswers,
  encodeGaps,
  questions,
  templateFor,
  type Answers,
  type FrameNode,
  type Gap,
  type QuestionId,
} from "@visualizer/core";
import { AskMark } from "./ask-mark.js";

function FrameNodeView({ node }: { node: FrameNode }) {
  switch (node.kind) {
    case "toolbar":
      return (
        <Toolbar aria-label={node.label}>
          {node.items.map((item) => (
            <ToolbarButton key={item} onClick={() => undefined}>
              {item}
            </ToolbarButton>
          ))}
        </Toolbar>
      );
    case "tabs": {
      const first = node.tabs[0];
      if (!first) return null;
      return (
        <Tabs defaultValue={first.value}>
          <TabsList aria-label={node.label}>
            {node.tabs.map((tab) => (
              <TabsTab key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTab>
            ))}
          </TabsList>
          {node.tabs.map((tab) => (
            <TabsPanel key={tab.value} value={tab.value}>
              {tab.panel}
            </TabsPanel>
          ))}
        </Tabs>
      );
    }
    case "input":
      return <Input readOnly aria-label={node.label} placeholder={node.label} value="" />;
    case "button":
      return <Button onClick={() => undefined}>{node.label}</Button>;
    case "separator":
      return <Separator />;
    case "meter":
      return (
        <Meter value={node.value}>
          <MeterLabel>{node.label}</MeterLabel>
          <MeterValue />
          <MeterTrack>
            <MeterIndicator />
          </MeterTrack>
        </Meter>
      );
    default: {
      const unreachable: never = node;
      return unreachable;
    }
  }
}

function QuestionField({
  question,
  answers,
  onAnswer,
}: {
  question: (typeof questions)[number];
  answers: Answers;
  onAnswer: (id: QuestionId, value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel>{question.prompt}</FieldLabel>
      <RadioGroup
        aria-label={question.prompt}
        name={question.id}
        value={answers[question.id] ?? null}
        onValueChange={(next) => {
          if (typeof next !== "string") return;
          onAnswer(question.id, next);
        }}
      >
        {question.options.map((option) => (
          <label key={option.value} data-choice={option.value}>
            <Radio value={option.value}>
              <RadioIndicator />
            </Radio>
            {option.label}
          </label>
        ))}
      </RadioGroup>
    </Field>
  );
}

export function AskView({
  answers,
  gaps,
  onAnswer,
}: {
  answers: Answers;
  gaps: readonly Gap[];
  onAnswer: (id: QuestionId, value: string) => void;
}) {
  const template = answers.what === undefined ? undefined : templateFor(answers.what);
  const title = template?.title ?? "Pick what you are making.";
  return (
    <div className="ask" data-ask="true">
      <div className="questions" data-questions="true">
        {questions.map((question) => (
          <QuestionField key={question.id} question={question} answers={answers} onAnswer={onAnswer} />
        ))}
      </div>
      <div className="preview" data-preview={answers.what ?? "empty"}>
        <AskMark answers={encodeAnswers(answers)} gaps={encodeGaps(gaps)}>
          {title}
        </AskMark>
        <div className="wire" data-wire={answers.what ?? "empty"}>
          {template?.nodes.map((node, index) => (
            <FrameNodeView key={`${node.kind}-${index}`} node={node} />
          ))}
        </div>
        <ul className="gaps" data-gaps="true" aria-label="Open gaps">
          {gaps.map((gap) => (
            <li key={gap.id} data-gap={gap.id}>
              {gap.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
