import {
  describeWebMcpBridge,
  type WebMcpApproval,
  type WebMcpSource,
  type WebMcpToolSummary,
} from "@visualizer/core";
import { Toggle } from "./controls.js";

export type WebMcpStripState = {
  source: WebMcpSource | "pending";
  tools: readonly WebMcpToolSummary[];
};

export function WebMcpStrip({
  view,
  approval,
  onApproval,
}: {
  view: WebMcpStripState;
  approval: WebMcpApproval;
  onApproval: (approval: WebMcpApproval) => void;
}) {
  const copy =
    view.source === "pending"
      ? { heading: "Checking WebMCP", detail: "Looking for modelContext." }
      : describeWebMcpBridge(view.source, approval);

  return (
    <section
      className="webmcp-strip"
      aria-label="WebMCP bridge"
      data-webmcp-source={view.source}
      data-webmcp-approval={approval}
    >
      <div>
        <p className="eyebrow">WebMCP bridge</p>
        <p className="webmcp-mode">{copy.heading}</p>
        <p className="webmcp-detail">{copy.detail}</p>
      </div>
      <ul aria-label="Registered WebMCP tools">
        {view.tools.map((tool) => (
          <li key={tool.name} data-tool={tool.name}>
            {tool.name}
            <span>{tool.access}</span>
          </li>
        ))}
      </ul>
      <Toggle
        className="approval-toggle"
        pressed={approval === "local"}
        aria-label="Allow local writes"
        onPressedChange={(pressed) => onApproval(pressed ? "local" : "read-only")}
      >
        Allow local writes
      </Toggle>
    </section>
  );
}
