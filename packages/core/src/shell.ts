import { parse } from "@adaptate/core/result";
import type { StandardSchemaV1 } from "@adaptate/core/standard";
import { zodToOpenAPISchema } from "@adaptate/utils";
import { z } from "zod";

export const shellScreenSchema = z.object({
  screens: z.tuple([z.literal("flow")]),
  scroll: z.literal(false),
  shows: z.tuple([z.literal("stage"), z.literal("log")]),
});

export type ShellScreen = z.infer<typeof shellScreenSchema>;

function asStandard<T>(schema: z.ZodType<T>): StandardSchemaV1<unknown, T> {
  return schema as unknown as StandardSchemaV1<unknown, T>;
}

const checked = parse(asStandard(shellScreenSchema), {
  screens: ["flow"],
  scroll: false,
  shows: ["stage", "log"],
});

if (!checked.ok) {
  throw new Error("Shell screen failed schema check");
}

export const shellScreen: ShellScreen = checked.value;
export const shellScreenDocument: unknown = zodToOpenAPISchema(shellScreenSchema);
