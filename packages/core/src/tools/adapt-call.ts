import { transformSchema } from "@adaptate/core";
import { parse, parseStream } from "@adaptate/core/result";
import type { StandardSchemaV1 } from "@adaptate/core/standard";
import { createStreamValidator } from "@adaptate/core/stream";
import { isSettled } from "@adaptate/core/stream-incremental";
import { verifyStream } from "@adaptate/core/verify";
import { z } from "zod";
import { connectorCatalog, connectorIds, type ConnectorId } from "./delegation.js";

export const ConnectorCallSchema = z.object({
  connectorId: z.enum(connectorIds),
  workspaceVersion: z.number().int().nonnegative(),
  summary: z.string().min(1),
});
export type ConnectorCall = z.infer<typeof ConnectorCallSchema>;

const ReadyCallSchema = transformSchema(ConnectorCallSchema, {
  connectorId: true,
  workspaceVersion: true,
  summary: true,
});

const callValidator = createStreamValidator(ConnectorCallSchema, {
  ready: { connectorId: true, workspaceVersion: true, summary: true },
});

function asStandard<T>(schema: z.ZodType<T>): StandardSchemaV1<unknown, T> {
  return schema as unknown as StandardSchemaV1<unknown, T>;
}

export async function* pacedChunks(text: string, size = 16): AsyncGenerator<string> {
  for (let index = 0; index < text.length; index += size) {
    yield text.slice(index, index + size);
  }
}

export async function readConnectorCall(
  source: AsyncIterable<string | Uint8Array>,
): Promise<ConnectorCall> {
  let accepted: ConnectorCall | undefined;
  for await (const step of parseStream(source, asStandard(ConnectorCallSchema))) {
    if (!step.done) {
      if (step.result.ok) {
        const partialValue = ConnectorCallSchema.partial().safeParse(step.result.value);
        if (partialValue.success) {
          const partial = callValidator.partial(partialValue.data);
          if (partial.ready.valid && isSettled(step, ["summary"])) {
            accepted = ReadyCallSchema.parse(partialValue.data);
          }
        }
      }
      continue;
    }
    if (!step.result.ok || !isSettled(step, ["connectorId"]) || !isSettled(step, ["summary"])) {
      throw new Error("Tool call stream failed schema validation");
    }
    accepted = step.result.value;
  }
  if (!accepted) throw new Error("Tool call stream produced no document");
  const checked = parse(asStandard(ConnectorCallSchema), accepted);
  if (!checked.ok) throw new Error("Tool call failed the result parser");
  return checked.value;
}

export type ToolCallOutcome =
  | {
      ok: true;
      connectorId: ConnectorId;
      tool: string;
      summary: string;
      bytes: number;
    }
  | {
      ok: false;
      code: "STATE_CONFLICT" | "UNKNOWN_CONNECTOR" | "INVALID_CALL";
    };

export async function executeConnectorCall(
  call: ConnectorCall,
  actualVersion: number,
): Promise<ToolCallOutcome> {
  if (call.workspaceVersion !== actualVersion) {
    return { ok: false, code: "STATE_CONFLICT" };
  }
  const contract = connectorCatalog().find((item) => item.id === call.connectorId);
  if (!contract) return { ok: false, code: "UNKNOWN_CONNECTOR" };
  const required = contract.inputSchema.required;
  if (!Array.isArray(required) || !required.includes("workspaceVersion")) {
    return { ok: false, code: "INVALID_CALL" };
  }
  const body = JSON.stringify({
    connectorId: call.connectorId,
    tool: contract.tool,
    summary: call.summary,
    workspaceVersion: call.workspaceVersion,
  });
  const bytes = new TextEncoder().encode(body);
  const name = `${call.connectorId}.json`;
  const verified = await verifyStream(
    (async function* verifiedBytes() {
      yield bytes;
    })(),
    { size: bytes.byteLength, name },
    { name },
  );
  if (!verified.ok) return { ok: false, code: "INVALID_CALL" };
  return {
    ok: true,
    connectorId: call.connectorId,
    tool: contract.tool,
    summary: call.summary,
    bytes: verified.value.byteLength,
  };
}

export async function executeStreamedConnectorCall(
  source: AsyncIterable<string | Uint8Array>,
  actualVersion: number,
): Promise<ToolCallOutcome> {
  try {
    const call = await readConnectorCall(source);
    return await executeConnectorCall(call, actualVersion);
  } catch {
    return { ok: false, code: "INVALID_CALL" };
  }
}
