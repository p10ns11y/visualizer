import {
  BrainRouter,
  createLocalDecisionClient,
  createSampleWorkspace,
  localModelConfigFromEnv,
} from "../packages/core/src/index.ts";

const config = localModelConfigFromEnv();
const strict = process.env.VISUALIZER_LOCAL_MODEL_STRICT === "1";
const sample = createSampleWorkspace();
const router = new BrainRouter({
  prefer: 2,
  tier2: createLocalDecisionClient(config),
});

const judgement = await router.judge({
  cards: sample.problemCards,
  mockups: sample.mockups,
});

const report = {
  url: config.url,
  model: config.model,
  tier: judgement.tier,
  route: judgement.route,
  rank: judgement.rank,
  drift: judgement.drift,
  reason: judgement.reason,
  fellBackToTier1: judgement.tier !== 2,
};
console.log(JSON.stringify(report, null, 2));

if (strict && judgement.tier !== 2) {
  process.exitCode = 1;
}
