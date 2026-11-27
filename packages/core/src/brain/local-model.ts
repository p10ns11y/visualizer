import type { LocalDecisionClient } from "./router.js";

export type LocalModelConfig = {
  url: string;
  model: string;
  timeoutMs: number;
};

const DEFAULT_URL = "http://127.0.0.1:11434/v1";
const DEFAULT_MODEL = "decision";

function ambientEnv(): Record<string, string | undefined> {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process;
  return proc?.env ?? {};
}

export function localModelConfigFromEnv(
  env: Record<string, string | undefined> = ambientEnv(),
): LocalModelConfig {
  const timeout = Number(env.VISUALIZER_LOCAL_MODEL_TIMEOUT_MS ?? "1500");
  return {
    url: (env.VISUALIZER_LOCAL_MODEL_URL ?? DEFAULT_URL).replace(/\/$/, ""),
    model: env.VISUALIZER_LOCAL_MODEL_NAME ?? DEFAULT_MODEL,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 1500,
  };
}

export function createLocalDecisionClient(
  config: LocalModelConfig = localModelConfigFromEnv(),
  fetchImpl: typeof fetch = fetch,
): LocalDecisionClient {
  return {
    async complete(prompt: string) {
      const response = await fetchImpl(`${config.url}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          temperature: 0,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`Local decision model returned ${response.status}`);
      }
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new Error("Local decision model returned an empty body");
      return content;
    },
  };
}
