import {
  ensemblyKinds,
  lessonSignals,
  pilotPhases,
  type EnsemblyKind,
  type LessonSignal,
  type PilotPhase,
  type WorkspaceState,
} from "@visualizer/core";
import { useState } from "react";
import { Button } from "./ui/controls.js";

export type EnsemblyDraft = {
  kind: EnsemblyKind;
  summary: string;
  rationale: string;
  provenance: string;
  confirmedOutcome: string | null;
};

export type LessonDraft = {
  phase: PilotPhase;
  cardId: string | null;
  signal: LessonSignal;
  lesson: string;
  adjustment: string;
};

function kindLabel(kind: EnsemblyKind): string {
  switch (kind) {
    case "rule":
      return "Rule";
    case "costly_mistake":
      return "Costly mistake";
    case "decision":
      return "Decision";
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

function signalLabel(signal: LessonSignal): string {
  switch (signal) {
    case "friction":
      return "Friction";
    case "rework":
      return "Rework";
    case "adjustment":
      return "Adjustment";
    default: {
      const unreachable: never = signal;
      return unreachable;
    }
  }
}

export function MemoryPanel({
  state,
  onAppend,
  onPromote,
  onLesson,
}: {
  state: WorkspaceState;
  onAppend: (draft: EnsemblyDraft) => void;
  onPromote: (id: string) => void;
  onLesson: (draft: LessonDraft) => void;
}) {
  const [kind, setKind] = useState<EnsemblyKind>("rule");
  const [summary, setSummary] = useState("");
  const [rationale, setRationale] = useState("");
  const [provenance, setProvenance] = useState("");
  const [outcome, setOutcome] = useState("");
  const [signal, setSignal] = useState<LessonSignal>("friction");
  const [phase, setPhase] = useState<PilotPhase>(state.autopilot.phase);
  const [cardId, setCardId] = useState("");
  const [lesson, setLesson] = useState("");
  const [adjustment, setAdjustment] = useState("");
  const promoted = new Set(state.pulseMemory.map((pulse) => pulse.id));
  const appendReady = summary.trim() !== "" && rationale.trim() !== "" && provenance.trim() !== "";
  const lessonReady = lesson.trim() !== "" && adjustment.trim() !== "";

  return (
    <section className="memory-panel" aria-label="Memory" id="memory-panel">
      <header className="section-head">
        <p>Two-layer memory</p>
        <h2>Pulse and workflow lessons</h2>
      </header>
      <p className="memory-counts">
        Ledger {state.ensemblyLedger.length} · Pulse {state.pulseMemory.length} · Lessons{" "}
        {state.workflowLessons.length}
      </p>
      <div className="memory-grid">
        <div>
          <h3>Pulse Memory</h3>
          {state.pulseMemory.length === 0 ? <p className="pin">No promoted records yet.</p> : null}
          <ul className="memory-list">
            {state.pulseMemory.map((pulse) => (
              <li key={pulse.id}>
                <strong>{kindLabel(pulse.kind)}</strong>
                <span>{pulse.summary}</span>
                <em>{pulse.confirmedOutcome}</em>
              </li>
            ))}
          </ul>
          <h3>Ensembly ledger</h3>
          <ul className="memory-list">
            {state.ensemblyLedger.map((record) => {
              const ready = record.confirmedOutcome !== null && !promoted.has(record.id);
              return (
                <li key={record.id}>
                  <strong>{kindLabel(record.kind)}</strong>
                  <span>{record.summary}</span>
                  <em>
                    {record.confirmedOutcome ?? "Outcome not confirmed"}
                  </em>
                  {ready ? (
                    <Button type="button" onClick={() => onPromote(record.id)}>
                      Promote {record.id}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <h3>Workflow lessons</h3>
          <ul className="memory-list">
            {state.workflowLessons.map((item) => (
              <li key={item.id}>
                <strong>
                  {signalLabel(item.signal)} · {item.phase.replaceAll("_", " ")}
                </strong>
                <span>{item.lesson}</span>
                <em>{item.adjustment}</em>
              </li>
            ))}
          </ul>
        </div>
        <form
          className="memory-form"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <h3>Append an Ensembly record</h3>
          <label>
            <span>Kind</span>
            <select
              aria-label="Ensembly kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as EnsemblyKind)}
            >
              {ensemblyKinds.map((item) => (
                <option key={item} value={item}>
                  {kindLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Summary</span>
            <textarea
              aria-label="Ensembly summary"
              value={summary}
              rows={2}
              onChange={(event) => setSummary(event.target.value)}
            />
          </label>
          <label>
            <span>Rationale</span>
            <textarea
              aria-label="Ensembly rationale"
              value={rationale}
              rows={2}
              onChange={(event) => setRationale(event.target.value)}
            />
          </label>
          <label>
            <span>Provenance</span>
            <input
              aria-label="Ensembly provenance"
              value={provenance}
              onChange={(event) => setProvenance(event.target.value)}
            />
          </label>
          <label>
            <span>Confirmed outcome</span>
            <input
              aria-label="Ensembly confirmed outcome"
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
            />
          </label>
          <p className="pin">A confirmed outcome also promotes this record into Pulse Memory.</p>
          <Button
            type="button"
            disabled={!appendReady}
            onClick={() => {
              onAppend({
                kind,
                summary: summary.trim(),
                rationale: rationale.trim(),
                provenance: provenance.trim(),
                confirmedOutcome: outcome.trim() === "" ? null : outcome.trim(),
              });
              setSummary("");
              setRationale("");
              setProvenance("");
              setOutcome("");
            }}
          >
            Append Ensembly record
          </Button>
          <h3>Record a workflow lesson</h3>
          <label>
            <span>Signal</span>
            <select
              aria-label="Lesson signal"
              value={signal}
              onChange={(event) => setSignal(event.target.value as LessonSignal)}
            >
              {lessonSignals.map((item) => (
                <option key={item} value={item}>
                  {signalLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Phase</span>
            <select
              aria-label="Lesson phase"
              value={phase}
              onChange={(event) => setPhase(event.target.value as PilotPhase)}
            >
              {pilotPhases.map((item) => (
                <option key={item} value={item}>
                  {item.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Card</span>
            <select
              aria-label="Lesson card"
              value={cardId}
              onChange={(event) => setCardId(event.target.value)}
            >
              <option value="">No card</option>
              {state.problemCards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Lesson</span>
            <textarea
              aria-label="Workflow lesson"
              value={lesson}
              rows={2}
              onChange={(event) => setLesson(event.target.value)}
            />
          </label>
          <label>
            <span>Adjustment</span>
            <textarea
              aria-label="Workflow adjustment"
              value={adjustment}
              rows={2}
              onChange={(event) => setAdjustment(event.target.value)}
            />
          </label>
          <Button
            type="button"
            disabled={!lessonReady}
            onClick={() => {
              onLesson({
                phase,
                cardId: cardId === "" ? null : cardId,
                signal,
                lesson: lesson.trim(),
                adjustment: adjustment.trim(),
              });
              setLesson("");
              setAdjustment("");
            }}
          >
            Record workflow lesson
          </Button>
        </form>
      </div>
    </section>
  );
}
