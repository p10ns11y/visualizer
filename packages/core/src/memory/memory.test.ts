import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applyPilotEvent, assertCommit } from "../state/store.js";
import { readPersistedWorkspace, serializeWorkspace } from "../state/persist.js";
import { createSampleWorkspace } from "../state/sample.js";
import { WorkspaceStateSchema, type EnsemblyRecord } from "../state/schema.js";
import { appendEnsemblyRecord, promoteEnsemblyRecord, recordWorkflowLesson } from "./commit.js";
import {
  canonicalPackMaterial,
  exportPulsePack,
  legacyPulsePackFormat,
  mergeLedger,
  packHash,
  readPulsePack,
  recordsFromJsonl,
  recordsFromPack,
  recordsToJsonl,
} from "./ensembly.js";
import { InMemoryGraphMemoryStore } from "./in-memory-store.js";
import { Neo4jMemoryStore, type CypherRunner, type MemoryDriver } from "./neo4j-store.js";
import { projectWorkspace } from "./port.js";
import { schemaScript, mergeEnsemblyRecord } from "./cypher.js";

const confirmed: EnsemblyRecord = {
  id: "ens-test-rule",
  timestamp: "2026-11-27T12:00:00Z",
  kind: "rule",
  summary: "Keep the ledger append-only.",
  rationale: "A rewrite would hide the earlier outcome.",
  provenance: "packages/core/src/memory/ensembly.ts",
  confirmedOutcome: "Re-append of the same id does not change the first line.",
};

const openDecision: EnsemblyRecord = {
  ...confirmed,
  id: "ens-test-open",
  timestamp: "2026-11-27T12:00:01Z",
  kind: "decision",
  summary: "Wait for an outcome before promotion.",
  confirmedOutcome: null,
};

function fakeDriver(recordsFor: (query: string) => Array<Record<string, unknown>> = () => []) {
  const calls: Array<{ mode: "read" | "write"; query: string; params: Record<string, unknown> }> = [];
  const runner = (mode: "read" | "write"): CypherRunner => ({
    async run(query, params) {
      calls.push({ mode, query, params });
      return {
        records: recordsFor(query).map((row) => ({
          get(key: string) {
            return row[key];
          },
        })),
      };
    },
  });
  const driver: MemoryDriver = {
    session() {
      return {
        executeRead: (work) => work(runner("read")),
        executeWrite: (work) => work(runner("write")),
        async close() {},
      };
    },
    async close() {},
  };
  return { driver, calls };
}

describe("ensembly ledger", () => {
  it("locks the empty pack hash to the ensembly canonical material", () => {
    const material = canonicalPackMaterial([], [], null);
    expect(material).toBe('{"archive":[],"memory_hash":null,"traces":[]}');
    expect(packHash([], [], null)).toBe(
      createHash("sha256").update(material).digest("hex"),
    );
    expect(packHash([], [], null)).toBe(
      "158e899cc5d40297e512fc726750d1fd442921160f8b673dc48c02f743dc3703",
    );
  });

  it("round-trips JSONL and a pulse pack, and promotes only a confirmed outcome", () => {
    const jsonl = recordsToJsonl([confirmed, openDecision]);
    const parsed = recordsFromJsonl(jsonl);
    expect(parsed.skipped).toBe(0);
    expect(parsed.records).toEqual([confirmed, openDecision]);
    const archiveLine = JSON.stringify({
      nat_key: confirmed.id,
      ts: confirmed.timestamp,
      kind: confirmed.kind,
      payload: {
        summary: confirmed.summary,
        rationale: confirmed.rationale,
        provenance: confirmed.provenance,
        confirmedOutcome: confirmed.confirmedOutcome,
        id: confirmed.id,
        timestamp: confirmed.timestamp,
        kind: confirmed.kind,
      },
    });
    expect(recordsFromJsonl(`${archiveLine}\nnot-json\n`).records).toEqual([confirmed]);
    expect(recordsFromJsonl(`${archiveLine}\nnot-json\n`).skipped).toBe(1);

    const pack = exportPulsePack([confirmed, openDecision], { exportedAt: "2026-11-27T12:04:00Z" });
    expect(pack.memory_traces.map((trace) => trace.nat_key)).toEqual([confirmed.id]);
    expect(pack.archive_events).toHaveLength(2);
    expect(pack.memory_traces[0]?.kind).toBe("reflection");
    const read = readPulsePack(JSON.parse(JSON.stringify(pack)));
    expect(recordsFromPack(read).map((record) => record.id)).toEqual([confirmed.id, openDecision.id]);
    const tampered = { ...pack, pack_hash: "00".repeat(32) };
    expect(() => readPulsePack(tampered)).toThrow(/hash/);
    const legacy = { ...pack, format: legacyPulsePackFormat };
    expect(readPulsePack(legacy).format).toBe(legacyPulsePackFormat);

    const again = mergeLedger([confirmed], [confirmed, { ...confirmed, summary: "changed" }, openDecision]);
    expect(again.added).toBe(1);
    expect(again.skipped).toBe(1);
    expect(again.conflicts).toBe(1);
    expect(again.records[0]?.summary).toBe(confirmed.summary);
  });
});

describe("workspace memory commits", () => {
  it("promotes a confirmed record, rejects a stale version, and pauses a working phase", () => {
    const seeded = createSampleWorkspace();
    const appended = assertCommit(appendEnsemblyRecord(seeded, seeded.stateVersion, openDecision));
    expect(appended.pulseMemory.some((pulse) => pulse.id === openDecision.id)).toBe(false);
    expect(appended.ensemblyLedger.some((record) => record.id === openDecision.id)).toBe(true);
    expect(appended.eventLog.at(-1)?.kind).toBe("memory");
    const duplicate = appendEnsemblyRecord(appended, appended.stateVersion, openDecision);
    expect(duplicate.ok).toBe(true);
    if (!duplicate.ok) return;
    expect(duplicate.state.stateVersion).toBe(appended.stateVersion);

    const promoted = assertCommit(
      appendEnsemblyRecord(appended, appended.stateVersion, confirmed),
    );
    expect(promoted.pulseMemory.some((pulse) => pulse.id === confirmed.id)).toBe(true);
    const stale = promoteEnsemblyRecord(promoted, seeded.stateVersion, "ens-mistake-stale-tick");
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.error).toMatchObject({ code: "STATE_CONFLICT", actualVersion: promoted.stateVersion });

    const waiting = promoteEnsemblyRecord(promoted, promoted.stateVersion, "ens-mistake-stale-tick");
    expect(waiting.ok).toBe(true);
    if (!waiting.ok) return;
    expect(waiting.state.pulseMemory.map((pulse) => pulse.id)).toContain("ens-mistake-stale-tick");
    const repeat = promoteEnsemblyRecord(waiting.state, waiting.state.stateVersion, "ens-mistake-stale-tick");
    expect(repeat.ok).toBe(true);
    if (!repeat.ok) return;
    expect(repeat.state.stateVersion).toBe(waiting.state.stateVersion);

    let running = assertCommit(applyPilotEvent(seeded, 0, { type: "START" }));
    running = assertCommit(applyPilotEvent(running, running.stateVersion, { type: "PLAN_READY" }));
    const lesson = assertCommit(
      recordWorkflowLesson(running, running.stateVersion, {
        id: "lesson-running-canvas",
        recordedAt: "2026-11-27T12:05:00Z",
        phase: "running",
        cardId: "card-canvas",
        signal: "rework",
        lesson: "A stroke during running pauses the railway.",
        adjustment: "Finish the stroke before the next tick.",
      }),
    );
    expect(lesson.autopilot.phase).toBe("paused_by_human");
    expect(lesson.workflowLessons.some((item) => item.id === "lesson-running-canvas")).toBe(true);
    expect(lesson.eventLog.at(-1)?.message).toContain("Human edit paused the run.");
    const unknown = recordWorkflowLesson(lesson, lesson.stateVersion, {
      id: "lesson-missing-card",
      recordedAt: "2026-11-27T12:06:00Z",
      phase: "paused_by_human",
      cardId: "card-missing",
      signal: "adjustment",
      lesson: "Missing cards do not enter the graph.",
      adjustment: "Keep the lesson off the ledger.",
    });
    expect(unknown.ok).toBe(true);
    if (!unknown.ok) return;
    expect(unknown.state.stateVersion).toBe(lesson.stateVersion);
  });

  it("hydrates a pre-memory workspace payload with fresh empty arrays", () => {
    const current = createSampleWorkspace();
    const legacy: Record<string, unknown> = {
      ...current,
      stateVersion: 4,
      logSeq: 2,
      problemCards: current.problemCards.map((card) =>
        card.id === "card-canvas" ? { ...card, statement: "Kept from main." } : card,
      ),
    };
    delete legacy.ensemblyLedger;
    delete legacy.pulseMemory;
    delete legacy.workflowLessons;
    const raw = JSON.stringify(legacy);
    expect(raw.includes("ensemblyLedger")).toBe(false);
    expect(raw.includes("pulseMemory")).toBe(false);
    expect(raw.includes("workflowLessons")).toBe(false);
    const restored = readPersistedWorkspace(raw);
    const again = readPersistedWorkspace(raw);
    expect(restored?.ensemblyLedger).toEqual([]);
    expect(restored?.pulseMemory).toEqual([]);
    expect(restored?.workflowLessons).toEqual([]);
    expect(restored?.pulseMemory).not.toBe(again?.pulseMemory);
    expect(restored?.ensemblyLedger).not.toBe(again?.ensemblyLedger);
    expect(restored?.workflowLessons).not.toBe(again?.workflowLessons);
    expect(restored?.stateVersion).toBe(4);
    expect(restored?.problemCards.find((card) => card.id === "card-canvas")?.statement).toBe(
      "Kept from main.",
    );
    expect(restored?.strokes).toEqual(current.strokes);
    const roundTrip = WorkspaceStateSchema.parse(JSON.parse(serializeWorkspace(current)));
    expect(roundTrip.pulseMemory.map((pulse) => pulse.id)).toEqual(["ens-rule-stateversion"]);
  });
});

describe("memory graph port", () => {
  it("projects the workspace into the in-memory store and filters lessons", async () => {
    const state = createSampleWorkspace();
    const store = new InMemoryGraphMemoryStore();
    await projectWorkspace(store, state);
    expect(store.schemaApplied()).toBe(true);
    const pulse = await store.listPulse();
    expect(pulse.map((item) => item.id)).toEqual(["ens-rule-stateversion"]);
    expect(await store.listPulse("rule")).toHaveLength(1);
    expect(await store.listPulse("costly_mistake")).toEqual([]);
    await store.promote("ens-mistake-stale-tick");
    expect((await store.listPulse("costly_mistake")).map((item) => item.id)).toEqual([
      "ens-mistake-stale-tick",
    ]);
    expect(await store.promote("ens-decision-ledger")).toBeNull();
    const lessons = await store.listLessons({ phase: "planning", cardId: "card-bridge" });
    expect(lessons.map((lesson) => lesson.id)).toEqual(["lesson-planning-bridge"]);
    expect(await store.listLessons({ cardId: "card-canvas" })).toEqual([]);
    await store.upsertRecord(confirmed);
    await store.upsertRecord({ ...confirmed, summary: "ignored" });
    expect((await store.promote(confirmed.id))?.summary).toBe(confirmed.summary);
  });

  it("sends parameter bindings and the schema file text through the Neo4j adapter", async () => {
    const schemaPath = fileURLToPath(new URL("./cypher/schema.cypher", import.meta.url));
    expect(readFileSync(schemaPath, "utf8")).toBe(schemaScript);
    const hostile = "MATCH (n) DETACH DELETE n //";
    const record = { ...confirmed, id: "ens-hostile", summary: hostile };
    const bound = mergeEnsemblyRecord(record);
    expect(bound.text.includes(hostile)).toBe(false);
    expect(bound.params.summary).toBe(hostile);

    const { driver, calls } = fakeDriver((query) => {
      if (query.includes("RETURN pulse.id")) {
        return [
          {
            id: record.id,
            timestamp: record.timestamp,
            kind: record.kind,
            summary: record.summary,
            rationale: record.rationale,
            provenance: record.provenance,
            confirmedOutcome: record.confirmedOutcome,
          },
        ];
      }
      return [];
    });
    const store = new Neo4jMemoryStore(driver);
    await store.ensureSchema();
    await store.upsertRecord(record);
    const promoted = await store.promote(record.id);
    expect(promoted?.summary).toBe(hostile);
    expect(calls.some((call) => call.query === bound.text && call.params.summary === hostile)).toBe(true);
    expect(calls.filter((call) => call.query.startsWith("CREATE CONSTRAINT"))).toHaveLength(5);
    expect(calls.every((call) => !call.query.includes(hostile))).toBe(true);
    expect(Neo4jMemoryStore.fromEnv({})).toBeNull();
  });
});
