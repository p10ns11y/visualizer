# Pilot railway Build and human pause

Build starts the pilot railway. The working banner offers Stop. Editing a problem card while the banner is working also pauses the run and keeps the edit.

## Sub-features

- `build-start` leaves `idle` and shows `Agent is working`.
- `build-stop` pauses from the Stop button.
- `build-edit` pauses from a statement edit and keeps the new sentence.

## How to get to it (user POV)

- From Visual Cockpit at `idle`, press `Build`.
- Press `Stop` on the working banner, or edit a problem statement before the run finishes.
- Read the paused banner and the phase text `paused by human`.

## Driving it with verify-visualizer

Preconditions:

- Doctor reports a fresh cockpit at phase `idle`.
- The `Build` button is visible. It is hidden once the phase leaves `idle`.

- **Start Build.** Run `node scripts/verify-visualizer.mjs browser click --role button --name "Build"`. The status banner text includes `Agent is working` and the shell `data-phase` is no longer `idle`.
- **Pause with Stop.** Run `node scripts/verify-visualizer.mjs browser click --role button --name "Stop"`. The banner text includes `Paused by you` and `data-phase` is `paused_by_human`.
- **Proof.** Run `node scripts/verify-visualizer.mjs browser text --path /opt/cursor/artifacts/verify-visualizer/pilot-railway-build-pause.txt` and `node scripts/verify-visualizer.mjs browser screenshot --path /opt/cursor/artifacts/verify-visualizer/pilot-railway-build-pause.png`. The text file contains `Paused by you`.

## Gotchas

- Build waits about a third of a second before the first tick. A Stop click before the banner appears is a no-op because the phase is still `idle`.
- There is one `Build` button. After pause, `Resume` continues the loop. This recipe stops at pause.
- Editing during the working banner also pauses. That path is covered by the critical-flow render test. This drive uses Stop so the button name stays stable.
- Do not start this recipe on a page that already ran `drive visual-cockpit-editing` unless you launch again. `Build` is absent once the phase is not `idle`.
