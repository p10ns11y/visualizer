# Visual Cockpit editing

Visual Cockpit editing lets a person change a problem-card statement and see that statement, with a higher `stateVersion`, after opening Code Mode.

## Sub-features

- `cockpit-open` shows the seeded cards at version `v0`.
- `cockpit-edit` replaces the freehand canvas statement in one change.
- `cockpit-code` opens Code Mode without dropping the statement.

## How to get to it (user POV)

- Open the preview. The header reads Visual Cockpit.
- Edit the textbox named `Statement for Freehand canvas sketching`.
- Press the `Code Mode` toggle.

## Driving it with verify-visualizer

Preconditions:

- `node scripts/verify-visualizer.mjs doctor` prints `"ok": true`.
- The shell `data-mode` is `cockpit` and the version label is `v0`.
- The textbox `Statement for Freehand canvas sketching` is on the page.

- **Replace the statement.** Paste one sentence into the canvas card. Run `node scripts/verify-visualizer.mjs browser fill --role textbox --name "Statement for Freehand canvas sketching" --value "Verification stroke pinned to the canvas card."`. The version label becomes `v1`.
- **Open Code Mode.** Press `Code Mode`. Run `node scripts/verify-visualizer.mjs browser click --role button --name "Code Mode"`. The shell `data-mode` becomes `code` and the version label becomes `v2`.
- **Read the shared statement.** The code-mode textbox with the same accessible name contains `Verification stroke pinned to the canvas card.`.
- **Proof.** Run `node scripts/verify-visualizer.mjs drive visual-cockpit-editing` from a fresh launch when you want the fill, the toggle, and both proof files in one session. The text file and screenshot land in `/opt/cursor/artifacts/verify-visualizer/`.

## Gotchas

- Each input event commits. Typing one character at a time raises `stateVersion` once per character. The fill command pastes the whole sentence as one input so the version steps once.
- An empty statement is ignored. The proof sentence must contain non-space characters.
- `drive` expects to start from `v0`. Run it on a fresh launch, not after earlier fills.
- Separate browser commands share the launched page. Starting a second browser would show `v0` again and hide the edit.
