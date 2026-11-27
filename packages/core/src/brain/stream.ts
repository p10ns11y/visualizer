import {
  fromAsyncIterableSteps,
  type TrackedStep,
} from "@adaptate/core/stream-incremental";
import { parse, parseStream, type StreamStep } from "@adaptate/core/result";
import type { StandardSchemaV1 } from "@adaptate/core/standard";
import { makeConditionalSchemaTransformer } from "@adaptate/core";
import { z } from "zod";
import { JudgementSchema } from "../state/schema.js";

export const StreamJudgementSchema = JudgementSchema.extend({
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
});
export type StreamJudgement = z.infer<typeof StreamJudgementSchema>;

export const BrainEventSchema = z.object({
  kind: z.enum(["route", "rank", "drift", "step"]),
  skill: z.string().min(1),
  score: z.number(),
  note: z.string().optional(),
});
export type BrainEvent = z.infer<typeof BrainEventSchema>;

function asStandard<T>(schema: z.ZodType<T>): StandardSchemaV1<unknown, T> {
  return schema as unknown as StandardSchemaV1<unknown, T>;
}

export async function* chunkText(
  text: string,
  size = 18,
): AsyncGenerator<string> {
  for (let index = 0; index < text.length; index += size) {
    yield text.slice(index, index + size);
  }
}

export async function collectTrackedSteps(
  source: AsyncIterable<string | Uint8Array>,
): Promise<TrackedStep[]> {
  const steps: TrackedStep[] = [];
  for await (const step of fromAsyncIterableSteps(source)) steps.push(step);
  return steps;
}

export async function collectParsedSteps<T>(
  source: AsyncIterable<string | Uint8Array>,
  schema: z.ZodType<T>,
): Promise<Array<StreamStep<T, unknown>>> {
  const steps: Array<StreamStep<T, unknown>> = [];
  for await (const step of parseStream(source, asStandard(schema))) {
    steps.push(step);
  }
  return steps;
}

function extractJsonObject(text: string): string {
  const fenced = text.replace(/```(?:json)?/gi, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Judgement stream did not contain a JSON object");
  }
  return fenced.slice(start, end + 1);
}

export async function readJudgementStream(
  source: AsyncIterable<string | Uint8Array>,
): Promise<StreamJudgement> {
  const parts: string[] = [];
  for await (const chunk of source) {
    parts.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
  }
  const json = extractJsonObject(parts.join(""));
  const tracked = await collectTrackedSteps(chunkText(json, 16));
  if (tracked.length === 0 || !tracked.at(-1)?.complete) {
    throw new Error("Judgement stream ended before the document completed");
  }
  const parsedSteps = await collectParsedSteps(chunkText(json, 16), StreamJudgementSchema);
  const finalStep = parsedSteps.find((step) => step.done);
  if (!finalStep || !finalStep.result.ok) {
    throw new Error("Judgement stream failed schema validation");
  }
  const checked = parse(asStandard(StreamJudgementSchema), finalStep.result.value);
  if (!checked.ok) throw new Error("Judgement stream failed the result parser");
  return checked.value;
}

export function requireDriftNote(event: BrainEvent): BrainEvent {
  const transformer = makeConditionalSchemaTransformer(event);
  const conditional = transformer(BrainEventSchema, {
    note: { requiredIf: (data: BrainEvent) => data.kind === "drift" },
  });
  return BrainEventSchema.parse(conditional.run());
}
