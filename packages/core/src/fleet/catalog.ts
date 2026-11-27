import { parse } from "@adaptate/core/result";
import type { StandardSchemaV1 } from "@adaptate/core/standard";
import { z } from "zod";
import {
  FleetEdgeKindSchema,
  FleetNodeKindSchema,
  FleetProposalStatusSchema,
  type FleetGraph,
  type FleetProposal,
} from "../state/schema.js";
import type { FleetFinding } from "./analyze.js";

export const catalogComponentNames = ["FleetMap", "FleetNode", "FleetEdge", "Finding", "Proposal"] as const;

const IdSchema = z.string().min(1).max(80);
const TextSchema = z.string().min(1).max(240);

const FleetMapProps = z.object({ title: TextSchema }).strict();
const FleetNodeProps = z
  .object({
    nodeId: IdSchema,
    kind: FleetNodeKindSchema,
    label: TextSchema,
    summary: TextSchema,
  })
  .strict();
const FleetEdgeProps = z
  .object({
    edgeId: IdSchema,
    fromId: IdSchema,
    toId: IdSchema,
    kind: FleetEdgeKindSchema,
    label: TextSchema,
    live: z.boolean(),
  })
  .strict();
const FindingProps = z
  .object({
    code: z.enum(["cycle", "fan_in", "fan_out", "orphan", "dead_edge"]),
    summary: TextSchema,
    subjectIds: z.array(IdSchema).min(1).max(12),
  })
  .strict();
const ProposalProps = z
  .object({
    proposalId: IdSchema,
    actionId: z.string().min(1).max(120),
    status: FleetProposalStatusSchema,
    summary: TextSchema,
  })
  .strict();

const CatalogElementSchema = z.discriminatedUnion("type", [
  z.object({ id: IdSchema, type: z.literal("FleetMap"), props: FleetMapProps }).strict(),
  z.object({ id: IdSchema, type: z.literal("FleetNode"), props: FleetNodeProps }).strict(),
  z.object({ id: IdSchema, type: z.literal("FleetEdge"), props: FleetEdgeProps }).strict(),
  z.object({ id: IdSchema, type: z.literal("Finding"), props: FindingProps }).strict(),
  z.object({ id: IdSchema, type: z.literal("Proposal"), props: ProposalProps }).strict(),
]);

export const CatalogSpecSchema = z
  .object({
    root: IdSchema,
    elements: z.array(CatalogElementSchema).min(1).max(80),
  })
  .strict()
  .superRefine((spec, ctx) => {
    const root = spec.elements.find((element) => element.id === spec.root);
    if (!root || root.type !== "FleetMap") {
      ctx.addIssue({ code: "custom", message: "Catalog root must be a FleetMap element." });
    }
    const ids = spec.elements.map((element) => element.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", message: "Catalog element ids must be unique." });
    }
  });

export type CatalogSpec = z.infer<typeof CatalogSpecSchema>;
export type CatalogElement = CatalogSpec["elements"][number];

const bannedKeys = new Set([
  "dangerouslySetInnerHTML",
  "__html",
  "innerHTML",
  "script",
  "onClick",
  "onError",
  "__proto__",
  "constructor",
  "prototype",
]);

function asStandard<T>(schema: z.ZodType<T>): StandardSchemaV1<unknown, T> {
  return schema as unknown as StandardSchemaV1<unknown, T>;
}

function banned(value: unknown): string | null {
  if (typeof value === "string") {
    if (/javascript\s*:|<\/?\s*script/i.test(value)) return "Catalog text cannot carry executable markup.";
    return null;
  }
  if (typeof value === "function" || typeof value === "symbol") return "Catalog props cannot carry executable values.";
  if (Array.isArray(value)) {
    for (const entry of value) {
      const hit = banned(entry);
      if (hit) return hit;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    if (bannedKeys.has(key)) return `Catalog rejected the key ${key}.`;
    const hit = banned(child);
    if (hit) return hit;
  }
  return null;
}

export type CatalogRead =
  | { ok: true; spec: CatalogSpec }
  | { ok: false; message: string };

export function readCatalogSpec(input: unknown): CatalogRead {
  const blocked = banned(input);
  if (blocked) return { ok: false, message: blocked };
  const parsed = CatalogSpecSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.map((issue) => issue.message).join(" ") };
  }
  const checked = parse(asStandard(CatalogSpecSchema), parsed.data);
  if (!checked.ok) return { ok: false, message: "Catalog spec failed the typed parser." };
  return { ok: true, spec: checked.value };
}

export function buildFleetSpec(
  graph: FleetGraph,
  findings: readonly FleetFinding[],
  proposals: readonly FleetProposal[],
): CatalogSpec {
  const elements: CatalogSpec["elements"] = [
    { id: "fleet-map", type: "FleetMap", props: { title: "SI fleet interconnections" } },
  ];
  for (const node of graph.nodes) {
    elements.push({
      id: `node-${node.id}`,
      type: "FleetNode",
      props: { nodeId: node.id, kind: node.kind, label: node.label, summary: node.summary },
    });
  }
  for (const edge of graph.edges) {
    elements.push({
      id: `edge-${edge.id}`,
      type: "FleetEdge",
      props: {
        edgeId: edge.id,
        fromId: edge.fromId,
        toId: edge.toId,
        kind: edge.kind,
        label: edge.label,
        live: edge.live,
      },
    });
  }
  for (const finding of findings) {
    elements.push({
      id: `finding-${finding.id}`.replaceAll(/[^a-z0-9:-]/gi, "-"),
      type: "Finding",
      props: { code: finding.code, summary: finding.summary, subjectIds: finding.subjectIds },
    });
  }
  for (const proposal of proposals) {
    elements.push({
      id: `proposal-${proposal.id}`,
      type: "Proposal",
      props: {
        proposalId: proposal.id,
        actionId: proposal.actionId,
        status: proposal.status,
        summary: proposal.summary,
      },
    });
  }
  const spec = { root: "fleet-map", elements };
  const read = readCatalogSpec(spec);
  if (!read.ok) throw new Error(read.message);
  return read.spec;
}
