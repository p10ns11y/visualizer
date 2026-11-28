# Tier fallback and the local-model harness

The cockpit Build uses the deterministic Tier 1 router. The local-model harness is the command a person runs on the machine aliased `laptop-1` to see whether Tier 2 answers.

## Sub-features

- `tier-offline` completes Build when no frontier or local model is configured in the page.
- `tier-harness` runs `pnpm test:local-model` and prints a judgement.
- `tier-strict` is the same command with `VISUALIZER_LOCAL_MODEL_STRICT=1`, which exits non-zero when Tier 2 does not answer.

## How to get to it (user POV)

- Press `Build` in Visual Cockpit. The brief title `Visualizer Step 2` appears when the railway completes.
- In a terminal at the repo root, run `pnpm test:local-model`.
- On `laptop-1`, point `VISUALIZER_LOCAL_MODEL_URL` and `VISUALIZER_LOCAL_MODEL_NAME` at the local server first.

## Driving it with verify-visualizer

Preconditions:

- The page harness is only required for the Build half. The harness command does not need the preview.
- `VISUALIZER_LOCAL_MODEL_STRICT` is unset for the smoke. Strict mode is a different entry and fails closed when Tier 2 is down.

- **Run the harness.** Run `pnpm test:local-model`. Exit code `0`. Stdout JSON includes `tier`, `route`, and `fellBackToTier1`.
- **Read the fallback.** When nothing is listening on the default loopback URL, `fellBackToTier1` is `true` and `tier` is `1`. When a server answers, `tier` is `2`. Either result is a live harness. A missing server is not a failed smoke.
- **Proof.** Save stdout to `/opt/cursor/artifacts/verify-visualizer/local-model-harness.json`. The file is the proof. Do not delete it during cleanup.

## Gotchas

- The page does not call Tier 2. A green Build does not prove the harness.
- CI runs the critical-flow smoke of this command and allows the fallback. CI does not set the strict variable.
- The default URL is `http://127.0.0.1:11434/v1`. The host alias `laptop-1` is recorded in [docs/TECH-CHOICES.md](../../../../docs/TECH-CHOICES.md) and is not a network name.
- Cleanup of the browser session must not remove the JSON proof in the evidence directory.
