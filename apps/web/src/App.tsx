import {
  answerQuestion,
  applyFlowEvent,
  createFlow,
  emptyDesign,
  flowCan,
  logLine,
  recentLog,
  stageLine,
  type Answers,
  type FlowEvent,
  type FlowState,
  type QuestionId,
} from "@visualizer/core";
import { lazy, Suspense, useEffect, useState } from "react";
import { connectModelContext } from "./agent.js";
import { StageView } from "./view.js";

const SettingsDialog = lazy(() => import("./settings-dialog.js"));

const controls: ReadonlyArray<{ type: FlowEvent["type"]; label: string }> = [
  { type: "START", label: "Start" },
  { type: "PAUSE", label: "Pause" },
  { type: "STOP", label: "Stop" },
];

export function App() {
  const [flow, setFlow] = useState<FlowState>(() => createFlow());
  const [answers, setAnswers] = useState<Answers>({});
  const [settingsOpen, setSettingsOpen] = useState(false);

  function onAnswer(id: QuestionId, value: string) {
    setAnswers((current) => answerQuestion(current, id, value));
  }

  useEffect(() => connectModelContext(document), []);

  function send(event: FlowEvent) {
    const result = applyFlowEvent(flow, flow.stateVersion, event);
    if (result.ok) setFlow(result.state);
  }

  return (
    <main className="screen" data-screen="flow" data-scroll="false">
      <div className="readout">
        <h1>Visualizer</h1>
        <p className="stage" data-stage={flow.stage} data-motion={flow.motion} data-mode={flow.mode}>
          {stageLine(flow)}
        </p>
      </div>
      <div className="controls">
        {controls.map((control) => (
          <button
            key={control.type}
            type="button"
            disabled={!flowCan(flow, { type: control.type })}
            onClick={() => send({ type: control.type })}
          >
            {control.label}
          </button>
        ))}
        {flow.stage === "done" ? (
          <button type="button" onClick={() => send({ type: "RESET" })}>
            Reset
          </button>
        ) : null}
        <button type="button" onClick={() => setSettingsOpen(true)}>
          Settings
        </button>
        {settingsOpen ? (
          <Suspense fallback={null}>
            <SettingsDialog
              open={settingsOpen}
              mode={flow.mode}
              onOpenChange={setSettingsOpen}
              onToggleMode={() => send({ type: "TOGGLE_MODE" })}
            />
          </Suspense>
        ) : null}
      </div>
      <StageView flow={flow} answers={answers} design={emptyDesign} onAnswer={onAnswer} />
      <h2 id="event-log-heading">Event log</h2>
      <ol className="log" data-log="true" aria-labelledby="event-log-heading">
        {recentLog(flow.eventLog).map((entry) => (
          <li key={entry.id} data-event={entry.type}>
            {logLine(entry)}
          </li>
        ))}
      </ol>
    </main>
  );
}
