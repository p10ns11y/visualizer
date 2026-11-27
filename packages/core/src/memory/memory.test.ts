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
  legacyEnsemblyPulsePackFormat,
  legacyPulsePackFormat,
  legacyPulsePackFromRecords,
  mergeLedger,
  packHash,
  pulsePackSchema,
  readPulsePack,
  recordsFromJsonl,
  recordsFromPack,
  recordsToJsonl,
} from "./ensembly.js";
import { canPromote, verifyHashFor } from "./promote.js";
import { buildPulseInject, estimateTokens, pulseInjectPromptText } from "./pulse-inject.js";
import { InMemoryGraphMemoryStore } from "./in-memory-store.js";
import { Neo4jMemoryStore, type CypherRunner, type MemoryDriver } from "./neo4j-store.js";
import { projectWorkspace } from "./port.js";
import { schemaScript, listLessonsQuery, mergeEnsemblyRecord, promotePulse } from "./cypher.js";

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
    expect(pack.schema).toBe(pulsePackSchema);
    expect(pack.format).toBe("pulse-pack-v1");
    expect(pack.host).toBe("visualizer");
    expect(pack.traces.map((trace) => trace.nat_key)).toEqual([confirmed.id]);
    expect(pack.archive).toHaveLength(2);
    expect(pack.traces[0]?.kind).toBe("memory");
    expect(pack.traces[0]?.status).toBe("user-stated");
    expect(pack.traces[0]?.ext.coherence_milli).toBe(1000);
    expect(Number.isInteger(pack.traces[0]?.ext.coherence_milli)).toBe(true);
    expect(pack.traces[0]?.superseded_by).toBeNull();
    const read = readPulsePack(JSON.parse(JSON.stringify(pack)));
    expect(recordsFromPack(read).map((record) => record.id)).toEqual([openDecision.id, confirmed.id]);
    const tampered = { ...pack, ext: { content_sha256: "00".repeat(32) } };
    expect(() => readPulsePack(tampered)).toThrow(/hash/);
    const fractional = JSON.parse(JSON.stringify(pack)) as { traces: Array<{ ext: { coherence_milli: number } }> };
    const first = fractional.traces[0];
    if (!first) throw new Error("missing trace");
    first.ext.coherence_milli = 1.5;
    expect(() => readPulsePack(fractional)).toThrow(/float/);
    const floatText = JSON.stringify(pack).replace('"coherence_milli":1000', '"coherence_milli":1.0');
    expect(() => readPulsePack(floatText)).toThrow(/float/);
    const legacy = legacyPulsePackFromRecords([confirmed, openDecision], {
      exportedAt: "2026-11-27T12:04:00Z",
      format: legacyEnsemblyPulsePackFormat,
    });
    const legacyRead = readPulsePack(JSON.parse(JSON.stringify(legacy)));
    expect(legacyRead.format).toBe(legacyEnsemblyPulsePackFormat);
    expect(recordsFromPack(legacyRead).map((record) => record.id)).toEqual([confirmed.id, openDecision.id]);
    const peram = legacyPulsePackFromRecords([confirmed], {
      exportedAt: "2026-11-27T12:04:00Z",
      format: legacyPulsePackFormat,
    });
    expect(readPulsePack(peram).format).toBe(legacyPulsePackFormat);

    const again = mergeLedger([confirmed], [confirmed, { ...confirmed, summary: "changed" }, openDecision]);
    expect(again.added).toBe(1);
    expect(again.skipped).toBe(1);
    expect(again.conflicts).toBe(1);
    expect(again.records[0]?.summary).toBe(confirmed.summary);
  });
});

describe("workspace memory commits", () => {
  it("promotes a confirmed record, rejects a stale version, and keeps a working phase when a lesson is recorded", () => {
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
    const stale = promoteEnsemblyRecord(promoted, promoted.stateVersion + 3, "ens-mistake-stale-tick");
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
    const version = running.stateVersion;
    const lesson = assertCommit(
      recordWorkflowLesson(running, running.stateVersion, {
        id: "lesson-running-canvas",
        recordedAt: "2026-11-27T12:05:00Z",
        phase: "running",
        cardId: "card-canvas",
        signal: "rework",
        lesson: "A lesson during running stays on the aux layer.",
        adjustment: "Leave the railway in the working phase.",
      }),
    );
    expect(lesson.autopilot.phase).toBe("running");
    expect(lesson.stateVersion).toBe(version);
    expect(lesson.autopilot.banner).toBe("working");
    expect(lesson.workflowLessons.some((item) => item.id === "lesson-running-canvas")).toBe(true);
    expect(lesson.eventLog.at(-1)?.kind).toBe("memory");
    expect(lesson.eventLog.at(-1)?.message).toBe(
      "Recorded workflow lesson lesson-running-canvas on running for card-canvas.",
    );
    const stored = readPersistedWorkspace(serializeWorkspace(lesson));
    expect(stored?.autopilot.phase).toBe("running");
    expect(stored?.workflowLessons.some((item) => item.id === "lesson-running-canvas")).toBe(true);
    const ledgered = assertCommit(
      appendEnsemblyRecord(running, running.stateVersion, {
        ...openDecision,
        id: "ens-while-running",
        timestamp: "2026-11-27T12:05:01Z",
      }),
    );
    expect(ledgered.autopilot.phase).toBe("running");
    expect(ledgered.stateVersion).toBe(version);
    expect(ledgered.ensemblyLedger.some((record) => record.id === "ens-while-running")).toBe(true);
    const promotedRunning = assertCommit(
      promoteEnsemblyRecord(ledgered, ledgered.stateVersion, "ens-mistake-stale-tick"),
    );
    expect(promotedRunning.autopilot.phase).toBe("running");
    expect(promotedRunning.stateVersion).toBe(version);
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

describe("canon 1 admission and sparse inject", () => {
  it("admits user-stated and tool-verified traces and omits superseded rows", () => {
    const stated = { ...openDecision, id: "ens-stated", status: "user-stated" as const };
    const hashed = verifyHashFor(openDecision.summary);
    const verified = {
      ...openDecision,
      id: "ens-verified",
      timestamp: "2026-11-27T19:00:00Z",
      status: "tool-verified" as const,
      verifyHash: hashed,
      traceKind: "fact" as const,
      coherenceMilli: 1000,
    };
    const badHash = { ...verified, id: "ens-bad-hash", verifyHash: "sha256:00" };
    const superseded = { ...confirmed, id: "ens-old", supersededBy: "ens-verified" };
    expect(canPromote(stated)).toBe(true);
    expect(canPromote(verified)).toBe(true);
    expect(canPromote(badHash)).toBe(false);
    expect(canPromote({ ...openDecision, status: "tool-verified" })).toBe(false);
    expect(canPromote({ ...openDecision, status: "inferred" })).toBe(false);
    expect(canPromote(superseded)).toBe(false);
    expect(canPromote(confirmed)).toBe(true);

    const filler = "word ".repeat(80).trim();
    const bulky = Array.from({ length: 9 }, (_, index) => ({
      ...confirmed,
      id: `ens-bulk-${index}`,
      timestamp: `2026-11-27T12:10:0${index}Z`,
      summary: index === 0 ? filler : `Short fact ${index}`,
    }));
    const inject = buildPulseInject([stated, verified, superseded, badHash, ...bulky]);
    expect(inject.schema).toBe("pulse-pack-v1");
    expect(inject.limit).toBe(8);
    expect(inject.token_budget).toBe(120);
    expect(inject.traces.length).toBeLessThanOrEqual(8);
    expect(inject.tokens).toBeLessThanOrEqual(120);
    expect(inject.traces.some((trace) => trace.nat_key === "ens-old")).toBe(false);
    expect(inject.traces.some((trace) => trace.nat_key === "ens-bad-hash")).toBe(false);
    expect(inject.traces.some((trace) => trace.status === "tool-verified" && trace.kind === "fact")).toBe(true);
    expect(inject.tokens).toBe(
      inject.traces.length === 0 ? 0 : estimateTokens(pulseInjectPromptText(inject)),
    );
    if (inject.traces.length > 0) {
      const snippetTokens = inject.traces.reduce((sum, trace) => sum + estimateTokens(trace.snippet), 0);
      expect(inject.tokens).toBeGreaterThan(snippetTokens);
    }
  });

  it("round-trips tagged traces through a pulse pack", () => {
    const hashed = verifyHashFor(openDecision.summary);
    const stated = {
      ...openDecision,
      status: "user-stated" as const,
      traceKind: "context" as const,
      lock: "locked" as const,
      prefetchKey: "card-canvas",
      coherenceMilli: 250,
    };
    const verified = {
      ...openDecision,
      id: "ens-verified-rt",
      status: "tool-verified" as const,
      verifyHash: hashed,
      traceKind: "fact" as const,
      lock: "open" as const,
      coherenceMilli: 800,
    };
    const superseded = { ...confirmed, id: "ens-old-rt", supersededBy: "ens-verified-rt" };
    const pack = exportPulsePack([stated, verified, superseded], { exportedAt: "2026-11-27T20:00:00Z" });
    const back = recordsFromPack(readPulsePack(JSON.parse(JSON.stringify(pack))));
    const byId = new Map(back.map((record) => [record.id, record]));
    expect(byId.get(stated.id)).toMatchObject({
      status: "user-stated",
      traceKind: "context",
      lock: "locked",
      prefetchKey: "card-canvas",
      coherenceMilli: 250,
      confirmedOutcome: null,
    });
    expect(canPromote(byId.get(stated.id)!)).toBe(true);
    expect(byId.get(verified.id)).toMatchObject({
      status: "tool-verified",
      verifyHash: hashed,
      traceKind: "fact",
      coherenceMilli: 800,
      confirmedOutcome: null,
    });
    expect(canPromote(byId.get(verified.id)!)).toBe(true);
    expect(byId.get(superseded.id)?.supersededBy).toBe("ens-verified-rt");
    expect(canPromote(byId.get(superseded.id)!)).toBe(false);

    const trace = pack.traces.find((item) => item.nat_key === stated.id);
    if (!trace) throw new Error("missing stated trace");
    const content = { ...trace.ext.content };
    delete content.status;
    delete content.traceKind;
    delete content.lock;
    delete content.prefetchKey;
    delete content.verifyHash;
    delete content.coherenceMilli;
    const recovered = recordsFromPack({
      ...pack,
      archive: [],
      traces: [
        {
          ...trace,
          status: "user-stated",
          kind: "context",
          lock: "locked",
          verify_hash: null,
          prefetch_key: "card-canvas",
          superseded_by: null,
          ext: { ...trace.ext, coherence_milli: 250, content },
        },
      ],
    });
    expect(recovered[0]).toMatchObject({
      status: "user-stated",
      traceKind: "context",
      lock: "locked",
      prefetchKey: "card-canvas",
      coherenceMilli: 250,
    });
    expect(canPromote(recovered[0]!)).toBe(true);
  });

  it("skips superseded chains and cycles and keeps a short row after a bulky one", () => {
    expect(buildPulseInject([])).toEqual({
      schema: "pulse-pack-v1",
      limit: 8,
      token_budget: 120,
      tokens: 0,
      traces: [],
    });
    const chainC = { ...confirmed, id: "ens-chain-c", timestamp: "2026-11-27T18:00:00Z" };
    const chainB = {
      ...confirmed,
      id: "ens-chain-b",
      timestamp: "2026-11-27T18:00:01Z",
      supersededBy: "ens-chain-c",
    };
    const chainA = {
      ...confirmed,
      id: "ens-chain-a",
      timestamp: "2026-11-27T18:00:02Z",
      supersededBy: "ens-chain-b",
    };
    const cycleA = {
      ...confirmed,
      id: "ens-cycle-a",
      timestamp: "2026-11-27T18:00:03Z",
      supersededBy: "ens-cycle-b",
    };
    const cycleB = {
      ...confirmed,
      id: "ens-cycle-b",
      timestamp: "2026-11-27T18:00:04Z",
      supersededBy: "ens-cycle-a",
    };
    expect(buildPulseInject([chainA, chainB, chainC, cycleA, cycleB]).traces.map((trace) => trace.nat_key)).toEqual([
      "ens-chain-c",
    ]);

    const bulky = {
      ...confirmed,
      id: "ens-bulky",
      timestamp: "2026-11-27T22:00:00Z",
      summary: "word ".repeat(200).trim(),
    };
    const short = {
      ...confirmed,
      id: "ens-short",
      timestamp: "2026-11-27T21:00:00Z",
      summary: "Keep the short row.",
    };
    expect(estimateTokens(bulky.summary)).toBeGreaterThan(120);
    const fitted = buildPulseInject([bulky, short]);
    expect(fitted.traces.map((trace) => trace.nat_key)).toEqual(["ens-short"]);
    expect(fitted.tokens).toBeLessThanOrEqual(120);
    expect(fitted.tokens).toBe(estimateTokens(pulseInjectPromptText(fitted)));
    expect(fitted.tokens).toBeGreaterThan(estimateTokens(short.summary));

    const roomy = {
      ...confirmed,
      id: "ens-roomy",
      timestamp: "2026-11-27T23:00:00Z",
      summary: "word ".repeat(40).trim(),
    };
    const after = { ...short, id: "ens-after", timestamp: "2026-11-27T22:30:00Z" };
    const both = buildPulseInject([roomy, after]);
    expect(both.tokens).toBeLessThanOrEqual(120);
    expect(both.tokens).toBe(both.traces.length === 0 ? 0 : estimateTokens(pulseInjectPromptText(both)));
    expect(both.traces.every((trace) => trace.nat_key === "ens-roomy" || trace.nat_key === "ens-after")).toBe(true);
  });

  it("reads a box pack that omits ext and still checks tool-verified hashes", () => {
    const fixturePath = fileURLToPath(new URL("./fixtures/box-pulse-pack.json", import.meta.url));
    const raw = JSON.parse(readFileSync(fixturePath, "utf8")) as unknown;
    const pack = readPulsePack(raw);
    expect(pack.format).toBe("pulse-pack-v1");
    if (pack.format !== "pulse-pack-v1" || !("ext" in pack)) throw new Error("expected a Canon pack");
    expect(pack.ext.content_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(pack.traces).toHaveLength(2);
    expect(pack.traces.every((trace) => trace.ext.content.summary)).toBe(true);
    const records = recordsFromPack(pack);
    const stated = records.find((record) => record.id === "box-stated");
    const bad = records.find((record) => record.id === "box-bad-hash");
    expect(stated?.status).toBe("user-stated");
    expect(canPromote(stated!)).toBe(true);
    expect(bad?.status).toBe("tool-verified");
    expect(canPromote(bad!)).toBe(false);

    const hashedSnippet = "A tool-verified envelope hash matches the snippet.";
    const admitted = {
      nat_key: "box-good-hash",
      snippet: hashedSnippet,
      source: "synthetic",
      time: "2026-11-27T21:00:02Z",
      first_seen: "2026-11-27T21:00:02Z",
      last_seen: "2026-11-27T21:00:02Z",
      status: "tool-verified",
      kind: "fact",
      lock: "open",
      verify_hash: verifyHashFor(hashedSnippet),
      prefetch_key: null,
      superseded_by: null,
      seen_count: 1,
    };
    const loose = readPulsePack({
      format: "pulse-pack-v1",
      exported_at: "2026-11-27T21:00:02Z",
      host: "synthetic-box",
      traces: [admitted],
    });
    const good = recordsFromPack(loose).find((record) => record.id === "box-good-hash");
    expect(canPromote(good!)).toBe(true);
    expect(() =>
      readPulsePack({
        format: "pulse-pack-v1",
        exported_at: "2026-11-27T21:00:02Z",
        host: "synthetic-box",
        traces: [admitted],
        ext: { content_sha256: "deadbeef" },
      }),
    ).toThrow(/hash/);
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
    const hash = verifyHashFor(record.summary);
    const boundPulse = promotePulse(record.id, hash);
    expect(boundPulse.params).toEqual({ id: record.id, verifyHash: hash });
    expect(boundPulse.text.includes("record.verifyHash = $verifyHash")).toBe(true);
    expect(boundPulse.text.includes('verifyHash <> ""')).toBe(false);
    const promoteCall = calls.find((call) => call.query.includes("RETURN pulse.id"));
    expect(promoteCall?.params.verifyHash).toBeNull();
    expect(Neo4jMemoryStore.fromEnv({})).toBeNull();
  });

  it("filters lessons after WITH so phase and cardId drop non-matching rows", () => {
    const rows = [
      { id: "lesson-planning-bridge", phase: "planning", cardId: "card-bridge" },
      { id: "lesson-planning-open", phase: "planning", cardId: null },
      { id: "lesson-running-canvas", phase: "running", cardId: "card-canvas" },
    ] as const;
    const cases = [
      {
        phase: null,
        cardId: null,
        ids: ["lesson-planning-bridge", "lesson-planning-open", "lesson-running-canvas"],
      },
      { phase: "planning" as const, cardId: null, ids: ["lesson-planning-bridge", "lesson-planning-open"] },
      { phase: null, cardId: "card-bridge", ids: ["lesson-planning-bridge"] },
      { phase: "running" as const, cardId: "card-canvas", ids: ["lesson-running-canvas"] },
      { phase: "planning" as const, cardId: "card-canvas", ids: [] },
    ];
    for (const filter of cases) {
      const query = listLessonsQuery(filter);
      const optionalAt = query.text.indexOf("OPTIONAL MATCH");
      const withAt = query.text.indexOf("WITH lesson, phase, card");
      const whereAt = query.text.indexOf("WHERE");
      expect(optionalAt).toBeGreaterThan(-1);
      expect(withAt).toBeGreaterThan(optionalAt);
      expect(whereAt).toBeGreaterThan(withAt);
      expect(query.text.slice(optionalAt, withAt).includes("WHERE")).toBe(false);
      const predicate = query.text.slice(whereAt);
      expect(predicate.startsWith("WHERE ($phase IS NULL OR phase.name = $phase)")).toBe(true);
      expect(predicate.includes("AND ($cardId IS NULL OR card.id = $cardId)")).toBe(true);
      expect(query.params).toEqual({ phase: filter.phase, cardId: filter.cardId });
      const kept = rows.filter((row) => {
        const phaseOk = filter.phase == null || row.phase === filter.phase;
        const cardOk = filter.cardId == null || row.cardId === filter.cardId;
        return phaseOk && cardOk;
      });
      expect(kept.map((row) => row.id)).toEqual(filter.ids);
    }
  });
});
