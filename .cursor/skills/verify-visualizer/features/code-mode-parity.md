# Code Mode parity

Code Mode parity shows the same problem cards, railway phase, and `stateVersion` as Visual Cockpit. Changing the view is itself a committed write.

## Sub-features

- `code-open` switches the shell to `data-mode` `code`.
- `code-version` shows the bumped version in the header and in the event-log heading.
- `code-edit` edits a statement from the code-mode textbox.

## How to get to it (user POV)

- Press the `Code Mode` toggle in the header, or open the preview with the hash `#code`.
- Read `stateVersion` in the event-log heading.
- Edit `Statement for Freehand canvas sketching`.

## Driving it with verify-visualizer

Preconditions:

- Doctor reports the launched preview.
- A fresh page is Visual Cockpit at `v0`. The hash entry is not what `launch` opens.

- **Open Code Mode.** Run `node scripts/verify-visualizer.mjs browser click --role button --name "Code Mode"`. The shell `data-mode` is `code` and the version label is `v1`.
- **Read the log heading.** The event-log heading reads `stateVersion 1`.
- **Edit from code mode.** Run `node scripts/verify-visualizer.mjs browser fill --role textbox --name "Statement for Freehand canvas sketching" --value "Edited from Code Mode."`. The version label becomes `v2` and the textbox keeps that sentence.
- **Proof.** Run `node scripts/verify-visualizer.mjs browser text --path /opt/cursor/artifacts/verify-visualizer/code-mode-parity.txt` and `node scripts/verify-visualizer.mjs browser screenshot --path /opt/cursor/artifacts/verify-visualizer/code-mode-parity.png`. The text file contains `Edited from Code Mode.` and `v2`.

## Gotchas

- Launch always opens Visual Cockpit. Do not treat a hand-edited `#code` URL as the harness entry.
- The toggle is `aria-label` `Code Mode`, not the visible word alone. The click command uses that label.
- Opening Code Mode during a working Build does not pause the run. Pausing is the Build feature, not this one.
- This file's proof is separate from `drive visual-cockpit-editing`. Passing the cockpit drive does not verify this entry.
