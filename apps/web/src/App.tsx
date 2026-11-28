import {
  applyFlowEvent,
  createFlow,
  flowCan,
  logLine,
  stageLine,
  type FlowEvent,
  type FlowState,
} from "@visualizer/core";
import { useEffect, useState } from "react";
import { connectModelContext } from "./agent.js";
import { StageView } from "./view.js";

const controls: ReadonlyArray<{ type: FlowEvent["type"]; label: string }> = [
  { type: "START", label: "Start" },
  { type: "PAUSE", label: "Pause" },
  { type: "STOP", label: "Stop" },
];

export function App() {
  const [flow, setFlow] = useState<FlowState>(() => createFlow());

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
        <button
          type="button"
          aria-pressed={flow.mode === "advanced"}
          onClick={() => send({ type: "TOGGLE_MODE" })}
        >
          {flow.mode === "simple" ? "Advanced" : "Simple"}
        </button>
      </div>
      <StageView flow={flow} />
      <h2 id="event-log-heading">Event log</h2>
      <ol className="log" data-log="true" aria-labelledby="event-log-heading">
        {flow.eventLog.map((entry) => (
          <li key={entry.id} data-event={entry.type}>
            {logLine(entry)}
          </li>
        ))}
      </ol>
    </main>
  );
}
