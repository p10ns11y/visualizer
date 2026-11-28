# Architecture layers

```mermaid
flowchart LR
  flowGraph[Flow graph] --> viewMap[View map]
  viewMap --> screen[One screen]
  webmcp[WebMCP] --> screen
  screen --> uiSdk[ui-sdk]
```

```mermaid
flowchart LR
  asking -->|Start| editing
  editing -->|Start| choosingTools[choosing tools]
  choosingTools -->|Start| building
  building -->|Start| doneStage[done]
  doneStage -->|Reset| asking
  asking -->|Pause| paused[Paused]
  paused -->|Start| asking
  asking -->|Stop| doneStage
  simpleMode[Simple] -->|Toggle| advancedMode[Advanced]
  advancedMode -->|Toggle| simpleMode
```

The flow graph owns the stage and the mode. The view map picks one spec for that pair. The screen shows that spec, the stage line, and the event log. Advanced mode adds a later panel. A stage mark exposes `stage` to `snapshot`. WebMCP registers `snapshot`, `act`, and `query`. Its allow callback accepts component actions only. Start moves the stage, Pause holds it, and Stop reaches done. Reset after done returns to asking, live, and simple. The mode toggle does not change the stage. A log line is written only when the machine takes the event. The screen shows the latest 20 lines.

[`adaptate`](https://github.com/p10ns11y/adaptate) checks the screen schema. The flow graph is the only state machine. Core keeps importing `xstate`, `@adaptate/core`, and `@adaptate/utils`. `scripts/fetch-ref.sh` still fetches the reading copies.
