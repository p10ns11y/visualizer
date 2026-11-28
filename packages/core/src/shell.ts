import { parse } from "@adaptate/core/result";
import type { StandardSchemaV1 } from "@adaptate/core/standard";
import { zodToOpenAPISchema } from "@adaptate/utils";
import { z } from "zod";

export const bareShellSchema = z.object({
  screens: z.tuple([z.literal("empty")]),
  scroll: z.literal(false),
});

export type BareShell = z.infer<typeof bareShellSchema>;

function asStandard<T>(schema: z.ZodType<T>): StandardSchemaV1<unknown, T> {
  return schema as unknown as StandardSchemaV1<unknown, T>;
}

const checked = parse(asStandard(bareShellSchema), {
  screens: ["empty"],
  scroll: false,
});

if (!checked.ok) {
  throw new Error("Bare shell failed schema check");
}

export const bareShell: BareShell = checked.value;
export const bareShellDocument: unknown = zodToOpenAPISchema(bareShellSchema);
