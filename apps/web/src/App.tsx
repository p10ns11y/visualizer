import {
  appendEnsemblyRecord,
  appendSketchStroke,
  applyBuildTick,
  bannerFor,
  BrainRouter,
  canvasCardId,
  clearSketchStrokes,
  commitHuman,
  commitView,
  connectorCatalog,
  createSampleWorkspace,
  pauseRun,
  pilotPhases,
  promoteEnsemblyRecord,
  approvalFromStorage,
  decideFleetProposal,
  mergeAuxIntoTick,
  mountWorkspaceBridge,
  readModelContextGlobals,
  readWorkspaceStorage,
  recordWorkflowLesson,
  remainingTicks,
  resumeRun,
  serializeWorkspace,
  themePresets,
  webMcpApprovalStorageKey,
  workspaceStorageKey,
  type BuildBrief,
  type CommitResult,
  type MockupNode,
  type SketchPoint,
  type ThemeId,
  type WebMcpApproval,
  type WorkspaceBridge,
  type WorkspaceState,
} from "@visualizer/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MemoryPanel, type EnsemblyDraft, type LessonDraft } from "./memory-panel.js";
import { SketchPad } from "./sketch-pad.js";
import { pendingTickStillApplies } from "./tick-guard.js";
import { uiControlSnapshot } from "./ui/cockpit-agent.js";
import { Button, Toggle } from "./ui/controls.js";
import { FleetMap } from "./ui/fleet-map.js";
import { WebMcpStrip, type WebMcpStripState } from "./ui/webmcp-strip.js";

const defaultRouter = new BrainRouter({ prefer: 1 });
const connectors = connectorCatalog();

function readInitialApproval(): WebMcpApproval {
  if (typeof window === "undefined") return "read-only";
  return approvalFromStorage(window.localStorage.getItem(webMcpApprovalStorageKey));
}

function writeApproval(next: WebMcpApproval) {
  if (typeof window === "undefined") return;
  if (next === "local") window.localStorage.setItem(webMcpApprovalStorageKey, "local");
  else window.localStorage.removeItem(webMcpApprovalStorageKey);
}

function readInitialState(): WorkspaceState {
  const seeded = createSampleWorkspace();
  if (typeof window === "undefined") return seeded;
  const stored = readWorkspaceStorage((key) => window.localStorage.getItem(key));
  let state = stored ?? seeded;
  if (window.location.hash === "#code") state = { ...state, mode: "code" };
  if (window.location.hash === "#cockpit") state = { ...state, mode: "cockpit" };
  return state;
}

export function App({ router = defaultRouter }: { router?: BrainRouter } = {}) {
  const [state, setState] = useState<WorkspaceState>(readInitialState);
  const [notice, setNotice] = useState<string | null>(null);
  const [approval, setApprovalState] = useState<WebMcpApproval>(readInitialApproval);
  const [bridgeView, setBridgeView] = useState<WebMcpStripState>({ source: "pending", tools: [] });
  const stateRef = useRef(state);
  const approvalRef = useRef(approval);
  const token = useRef(0);
  approvalRef.current = approval;

  const apply = useCallback((result: CommitResult) => {
    if (!result.ok) {
      setNotice(
        result.error.code === "STATE_CONFLICT"
          ? `stateVersion ${result.error.expectedVersion} is stale. Current is ${result.error.actualVersion}.`
          : `${result.error.event} is not valid from ${result.error.from}.`,
      );
      return null;
    }
    stateRef.current = result.state;
    setState(result.state);
    setNotice(null);
    return result.state;
  }, []);

  const runLoop = useCallback(async () => {
    const mine = ++token.current;
    for (let guard = 0; guard < 8; guard += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 320));
      if (token.current !== mine) return;
      const current = stateRef.current;
      const phase = current.autopilot.phase;
      if (
        phase === "paused_by_human" ||
        phase === "failed" ||
        phase === "drift_detected" ||
        phase === "completed" ||
        current.autopilot.cursor === "done"
      ) {
        return;
      }
      const tick = current.autopilot.cursor;
      const startedVersion = current.stateVersion;
      const result = await applyBuildTick(current, startedVersion, tick, router);
      if (
        !pendingTickStillApplies(
          token.current,
          mine,
          stateRef.current.stateVersion,
          startedVersion,
        )
      ) {
        if (token.current !== mine) return;
        continue;
      }
      const next = result.ok
        ? { ok: true as const, state: mergeAuxIntoTick(stateRef.current, result.state) }
        : result;
      if (!apply(next)) return;
    }
  }, [apply, router]);

  useEffect(() => {
    window.localStorage.setItem(workspaceStorageKey, serializeWorkspace(state));
  }, [state]);

  useEffect(() => {
    let alive = true;
    let bridge: WorkspaceBridge | null = null;
    void mountWorkspaceBridge({
      globals: readModelContextGlobals(),
      getState: () => stateRef.current,
      getApproval: () => approvalRef.current,
      getUiSnapshot: uiControlSnapshot,
      onCommit: (result) => {
        apply(result);
      },
    }).then((mounted) => {
      if (!alive) {
        void mounted.release();
        return;
      }
      bridge = mounted;
      setBridgeView({ source: mounted.source, tools: mounted.tools });
    });
    return () => {
      alive = false;
      void bridge?.release();
    };
  }, [apply]);

  useEffect(() => {
    return () => {
      token.current += 1;
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = state.tokens.themeId;
    root.style.setProperty("--accent", state.tokens.accent);
    root.style.setProperty("--surface", state.tokens.surface);
    root.style.setProperty("--ink", state.tokens.ink);
  }, [state.tokens]);

  useEffect(() => {
    const next = state.mode === "code" ? "#code" : "#cockpit";
    if (window.location.hash !== next) history.replaceState(null, "", next);
  }, [state.mode]);

  useEffect(() => {
    const onHash = () => {
      const mode = window.location.hash === "#code" ? "code" : "cockpit";
      const current = stateRef.current;
      if (current.mode !== mode) apply(commitView(current, current.stateVersion, mode));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [apply]);

  function editStatement(cardId: string, statement: string) {
    if (!statement.trim()) return;
    const current = stateRef.current;
    apply(
      commitHuman(current, current.stateVersion, (draft) => ({
        ...draft,
        problemCards: draft.problemCards.map((card) =>
          card.id === cardId ? { ...card, statement } : card,
        ),
      })),
    );
  }

  function addStroke(cardId: string, points: SketchPoint[]) {
    const current = stateRef.current;
    apply(appendSketchStroke(current, current.stateVersion, { cardId, points }));
  }

  function clearStrokes(cardId: string) {
    const current = stateRef.current;
    apply(clearSketchStrokes(current, current.stateVersion, cardId));
  }

  function changeTheme(themeId: ThemeId) {
    const current = stateRef.current;
    apply(
      commitHuman(current, current.stateVersion, (draft) => ({
        ...draft,
        tokens: themePresets[themeId],
      })),
    );
  }

  function setApproval(next: WebMcpApproval) {
    setApprovalState(next);
    writeApproval(next);
  }

  function stop() {
    token.current += 1;
    const current = stateRef.current;
    apply(pauseRun(current, current.stateVersion));
  }

  function appendRecord(draft: EnsemblyDraft) {
    const current = stateRef.current;
    apply(
      appendEnsemblyRecord(current, current.stateVersion, {
        id: `ens-${current.logSeq + 1}`,
        timestamp: new Date().toISOString(),
        kind: draft.kind,
        summary: draft.summary,
        rationale: draft.rationale,
        provenance: draft.provenance,
        confirmedOutcome: draft.confirmedOutcome,
        ...(draft.status ? { status: draft.status } : {}),
      }),
    );
  }

  function promoteRecord(id: string) {
    const current = stateRef.current;
    apply(promoteEnsemblyRecord(current, current.stateVersion, id));
  }

  function decideProposal(proposalId: string, status: "approved" | "rejected") {
    const current = stateRef.current;
    const result = decideFleetProposal(current, current.stateVersion, proposalId, status);
    if (!result.ok && !("error" in result)) {
      setNotice(
        result.code === "UNKNOWN_PROPOSAL"
          ? `Unknown proposal ${result.proposalId}.`
          : `Proposal ${result.proposalId} is already ${result.status}.`,
      );
      return;
    }
    apply(result);
  }

  function appendLesson(draft: LessonDraft) {
    const current = stateRef.current;
    apply(
      recordWorkflowLesson(current, current.stateVersion, {
        id: `lesson-${current.logSeq + 1}`,
        recordedAt: new Date().toISOString(),
        ...draft,
      }),
    );
  }

  const banner = bannerFor(state.autopilot.phase);
  const ticksLeft = remainingTicks(state.autopilot.cursor);

  return (
    <div
      className="shell"
      data-mode={state.mode}
      data-phase={state.autopilot.phase}
      data-stroke-count={state.strokes.length}
      data-pulse-count={state.pulseMemory.length}
      data-lesson-count={state.workflowLessons.length}
    >
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <div>
            <p className="eyebrow">
              {state.mode === "code" ? "Code Mode" : "Visual Cockpit"}
            </p>
            <h1>Visualizer</h1>
          </div>
        </div>
        <div className="top-actions">
          <p className="version" aria-label="state version">
            v{state.stateVersion}
          </p>
          <p className="phase">{state.autopilot.phase.replaceAll("_", " ")}</p>
          <label className="theme">
            <span>Design system</span>
            <select
              aria-label="Design system"
              value={state.tokens.themeId}
              onChange={(event) => changeTheme(event.target.value as ThemeId)}
            >
              <option value="paper">Paper</option>
              <option value="ink">Ink</option>
              <option value="dusk">Dusk</option>
            </select>
          </label>
          <Toggle
            className="mode-toggle"
            pressed={state.mode === "code"}
            aria-label="Code Mode"
            onPressedChange={(pressed) => {
              const current = stateRef.current;
              apply(
                commitView(current, current.stateVersion, pressed ? "code" : "cockpit"),
              );
            }}
          >
            Code Mode
          </Toggle>
          {state.autopilot.phase === "idle" ? (
            <Button className="build" type="button" onClick={() => void runLoop()}>
              Build
            </Button>
          ) : null}
        </div>
      </header>

      {banner === "working" ? (
        <div className="banner working" role="status">
          <strong>Agent is working</strong>
          <span>{ticksLeft.length} steps on the rail</span>
          <Button className="stop" type="button" onClick={stop}>
            Stop
          </Button>
        </div>
      ) : null}
      {banner === "paused" ? (
        <div className="banner paused" role="status">
          <strong>Paused by you</strong>
          <span>The run is holding your edit</span>
          <Button
            className="resume"
            type="button"
            onClick={() => {
              const current = stateRef.current;
              const next = apply(resumeRun(current, current.stateVersion));
              if (next) void runLoop();
            }}
          >
            Resume
          </Button>
        </div>
      ) : null}
      {banner === "drift" ? (
        <div className="banner drift" role="status">
          <strong>Drift detected</strong>
          <span>{state.autopilot.judgement?.reason}</span>
          <Button className="stop" type="button" onClick={stop}>
            Stop
          </Button>
        </div>
      ) : null}
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}

      <WebMcpStrip view={bridgeView} approval={approval} onApproval={setApproval} />
      <FleetMap state={state} onDecide={decideProposal} />

      {state.mode === "cockpit" ? (
        <Cockpit state={state} onStatement={editStatement} onStroke={addStroke} />
      ) : (
        <CodeMode state={state} onStatement={editStatement} onClearStrokes={clearStrokes} />
      )}
      <MemoryPanel
        state={state}
        onAppend={appendRecord}
        onPromote={promoteRecord}
        onLesson={appendLesson}
      />
    </div>
  );
}

function Cockpit({
  state,
  onStatement,
  onStroke,
}: {
  state: WorkspaceState;
  onStatement: (id: string, statement: string) => void;
  onStroke: (cardId: string, points: SketchPoint[]) => void;
}) {
  return (
    <main className="split">
      <section className="cards" aria-label="Problem statements">
        <header className="section-head">
          <p>Problem statements</p>
          <h2>Step 2 of Visualizer</h2>
        </header>
        <ol>
          {state.problemCards.map((card, index) => (
            <li key={card.id}>
              <span className="index">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{card.title}</h3>
                <textarea
                  aria-label={`Statement for ${card.title}`}
                  value={card.statement}
                  rows={3}
                  onChange={(event) => onStatement(card.id, event.target.value)}
                />
                <p className="acceptance">{card.acceptance}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="stage-wrap" aria-label="Live mockup">
        <header className="section-head">
          <p>Live mockup</p>
          <h2>Plates and connections</h2>
        </header>
        <div className="stage">
          <svg className="edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {state.connections.map((edge) => {
              const fromNode = state.mockups.find((node) => node.id === edge.fromId);
              const toNode = state.mockups.find((node) => node.id === edge.toId);
              if (!fromNode || !toNode) return null;
              const from = port(fromNode, toNode);
              const to = port(toNode, fromNode);
              return (
                <path
                  key={edge.id}
                  d={`M ${from.x} ${from.y} C ${(from.x + to.x) / 2} ${from.y}, ${(from.x + to.x) / 2} ${to.y}, ${to.x} ${to.y}`}
                />
              );
            })}
          </svg>
          {state.mockups.map((node) => (
            <article
              key={node.id}
              className={`plate plate-${node.kind}`}
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
            >
              <p>{node.kind}</p>
              <h3>{node.title}</h3>
              {node.kind === "canvas" ? (
                <SketchPad
                  cardId={canvasCardId}
                  cardTitle={
                    state.problemCards.find((card) => card.id === canvasCardId)?.title ??
                    "Freehand canvas sketching"
                  }
                  strokes={state.strokes}
                  onStroke={onStroke}
                />
              ) : (
                <PlateBody kind={node.kind} />
              )}
              <p className="summary">{node.summary}</p>
            </article>
          ))}
        </div>
        <ul className="edge-list">
          {state.connections.map((edge) => (
            <li key={edge.id}>
              {edge.fromId.replace("plate-", "")} {edge.label} {edge.toId.replace("plate-", "")}
            </li>
          ))}
        </ul>
        {state.brief ? <Brief brief={state.brief} /> : null}
      </section>
    </main>
  );
}

function port(node: MockupNode, toward: MockupNode) {
  const dx = toward.x - node.x;
  const dy = toward.y - node.y;
  if (Math.abs(dy) >= Math.abs(dx)) {
    return { x: node.x + 21, y: dy > 0 ? node.y + 30 : node.y };
  }
  return { x: dx > 0 ? node.x + 42 : node.x, y: node.y + 12 };
}

function PlateBody({ kind }: { kind: Exclude<MockupNode["kind"], "canvas"> }) {
  switch (kind) {
    case "bridge":
      return (
        <p className="kv">
          <span>document.modelContext</span>
          <span>workspace</span>
        </p>
      );
    case "log":
      return (
        <ol className="log-rows">
          <li>v0 seed</li>
          <li>v1 planning</li>
          <li>v2 running</li>
        </ol>
      );
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

function CodeMode({
  state,
  onStatement,
  onClearStrokes,
}: {
  state: WorkspaceState;
  onStatement: (id: string, statement: string) => void;
  onClearStrokes: (cardId: string) => void;
}) {
  const spec = useMemo(
    () => ({
      stateVersion: state.stateVersion,
      mode: state.mode,
      phase: state.autopilot.phase,
      banner: state.autopilot.banner,
      route: state.autopilot.judgement?.route ?? null,
      tier: state.autopilot.judgement?.tier ?? null,
      cards: state.problemCards.map((card) => ({
        id: card.id,
        title: card.title,
        statement: card.statement,
      })),
      strokes: state.strokes,
      brief: state.brief,
    }),
    [state],
  );

  return (
    <main className="code-layout">
      <section className="rail-panel" aria-label="Pilot railway">
        <header className="section-head">
          <p>XState railway</p>
          <h2>{state.autopilot.phase.replaceAll("_", " ")}</h2>
        </header>
        <ol className="rail">
          {pilotPhases.map((phase) => (
            <li key={phase} aria-current={phase === state.autopilot.phase ? "step" : undefined}>
              {phase.replaceAll("_", " ")}
            </li>
          ))}
        </ol>
      </section>

      <section className="spec-panel" aria-label="Typed spec">
        <header className="section-head">
          <p>Typed spec</p>
          <h2>Shared workspace</h2>
        </header>
        <div className="sketch-list" aria-label="Pinned strokes">
          <h3>Pinned strokes</h3>
          {state.strokes.length === 0 ? <p className="pin">No strokes pinned yet.</p> : null}
          {state.problemCards.map((card) => {
            const pinned = state.strokes.filter((stroke) => stroke.cardId === card.id);
            if (pinned.length === 0) return null;
            return (
              <article key={card.id}>
                <p className="pin">
                  {pinned.length} {pinned.length === 1 ? "stroke" : "strokes"} pinned to {card.title}
                </p>
                <ol>
                  {pinned.map((stroke) => (
                    <li key={stroke.id}>
                      <span>{stroke.id}</span>
                      <span>{stroke.points.length} points</span>
                    </li>
                  ))}
                </ol>
                <Button type="button" onClick={() => onClearStrokes(card.id)}>
                  Clear strokes for {card.title}
                </Button>
              </article>
            );
          })}
        </div>
        <div className="spec-cards">
          {state.problemCards.map((card) => (
            <label key={card.id}>
              <span>{card.title}</span>
              <textarea
                aria-label={`Statement for ${card.title}`}
                value={card.statement}
                rows={2}
                onChange={(event) => onStatement(card.id, event.target.value)}
              />
            </label>
          ))}
        </div>
        <details>
          <summary>Workspace JSON</summary>
          <pre>{JSON.stringify(spec, null, 2)}</pre>
        </details>
      </section>

      <section className="tool-panel" aria-label="Tool schemas">
        <header className="section-head">
          <p>WebMCP / MCP</p>
          <h2>Connector contracts</h2>
        </header>
        <ul>
          {connectors.map((connector) => (
            <li key={connector.id}>
              <strong>{connector.tool}</strong>
              <em>{connector.id}</em>
              <span>{connector.purpose}</span>
              <code>
                {schemaFields(connector.inputSchema)}
              </code>
            </li>
          ))}
        </ul>
      </section>

      <section className="log-panel" aria-label="Event log">
        <header className="section-head">
          <p>Event log</p>
          <h2>stateVersion {state.stateVersion}</h2>
        </header>
        <ol>
          {state.eventLog.map((entry) => (
            <li key={entry.id}>
              <span>v{entry.stateVersion}</span>
              <em>{entry.kind}</em>
              <p>{entry.message}</p>
            </li>
          ))}
        </ol>
        {state.brief ? <Brief brief={state.brief} /> : null}
      </section>
    </main>
  );
}

function schemaFields(schema: { properties?: Record<string, unknown>; required?: string[] }) {
  const names = Object.keys(schema.properties ?? {});
  const required = new Set(schema.required ?? []);
  if (names.length === 0) return "object";
  return names.map((name) => (required.has(name) ? name : `${name}?`)).join(" · ");
}

function Brief({ brief }: { brief: BuildBrief }) {
  return (
    <article className="brief">
      <header>
        <p>{brief.verified ? "Verified brief" : "Unverified brief"}</p>
        <h2>{brief.title}</h2>
      </header>
      <p className="brief-route">
        Tier {brief.tier} · {brief.route}
      </p>
      <ol>
        {brief.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="runner">{brief.runnerSummary}</p>
    </article>
  );
}
