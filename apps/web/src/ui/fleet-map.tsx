import {
  analyzeFleet,
  buildFleetSpec,
  measureCockpitSurface,
  readCatalogSpec,
  type CatalogElement,
  type WorkspaceState,
} from "@visualizer/core";

const columns: Record<string, number> = {
  bot: 70,
  routine: 230,
  task: 390,
  store: 550,
};

export function FleetMap({
  state,
  onDecide,
}: {
  state: WorkspaceState;
  onDecide: (proposalId: string, status: "approved" | "rejected") => void;
}) {
  const read = readCatalogSpec(buildFleetSpec(state.fleetGraph, analyzeFleet(state.fleetGraph), state.fleetProposals));
  const spec = read.ok ? read.spec : null;
  const tokens = measureCockpitSurface(state);
  const nodes = spec?.elements.filter((element) => element.type === "FleetNode") ?? [];
  const edges = spec?.elements.filter((element) => element.type === "FleetEdge") ?? [];
  const notes = spec?.elements.filter((element) => element.type === "Finding") ?? [];
  const proposals = spec?.elements.filter((element) => element.type === "Proposal") ?? [];
  const title = spec?.elements.find((element) => element.type === "FleetMap")?.props.title;
  const placed = placeNodes(nodes);

  return (
    <section className="fleet" aria-label="Interconnection map">
      <header className="section-head">
        <p>Sample fleet</p>
        <h2>{title ?? "Catalog rejected"}</h2>
      </header>
      {read.ok ? null : (
        <p className="notice" role="status">
          {read.message}
        </p>
      )}
      <div className="fleet-layout">
        <svg className="fleet-edges" viewBox="0 0 640 420" role="img" aria-label="Fleet edges">
          {edges.map((edge) => {
            if (edge.type !== "FleetEdge") return null;
            const from = placed.get(edge.props.fromId);
            const to = placed.get(edge.props.toId);
            if (!from || !to) return null;
            return (
              <line
                key={edge.id}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                data-live={edge.props.live ? "yes" : "no"}
              >
                <title>{`${edge.props.label} ${edge.props.fromId} to ${edge.props.toId}`}</title>
              </line>
            );
          })}
          {nodes.map((node) => {
            if (node.type !== "FleetNode") return null;
            const at = placed.get(node.props.nodeId);
            if (!at) return null;
            return (
              <g key={node.id} transform={`translate(${at.x} ${at.y})`}>
                <rect x={-58} y={-28} width={116} height={56} rx={12} />
                <text y={-4} textAnchor="middle">
                  {node.props.label}
                </text>
                <text y={14} textAnchor="middle" className="fleet-kind">
                  {node.props.kind}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="fleet-side">
          <h3>Findings</h3>
          <ul>
            {notes.map((note) =>
              note.type === "Finding" ? (
                <li key={note.id} data-code={note.props.code}>
                  {note.props.summary}
                </li>
              ) : null,
            )}
          </ul>
          <h3>Proposal ledger</h3>
          {proposals.length === 0 ? <p>No pending proposals.</p> : null}
          <ul>
            {proposals.map((proposal) =>
              proposal.type === "Proposal" ? (
                <li key={proposal.id}>
                  <p>
                    {proposal.props.status}: {proposal.props.summary}
                  </p>
                  {proposal.props.status === "pending" ? (
                    <div className="fleet-decide">
                      <button type="button" onClick={() => onDecide(proposal.props.proposalId, "approved")}>
                        Approve {proposal.props.actionId}
                      </button>
                      <button type="button" onClick={() => onDecide(proposal.props.proposalId, "rejected")}>
                        Reject {proposal.props.actionId}
                      </button>
                    </div>
                  ) : null}
                </li>
              ) : null,
            )}
          </ul>
          <h3>Snapshot tokens</h3>
          <dl className="token-compare" aria-label="Snapshot token comparison">
            <div>
              <dt>Snapshot</dt>
              <dd data-token="snapshot">{tokens.snapshotTokens}</dd>
            </div>
            <div>
              <dt>Accessibility tree</dt>
              <dd data-token="accessibility">{tokens.accessibilityTokens}</dd>
            </div>
            <div>
              <dt>DOM</dt>
              <dd data-token="dom">{tokens.domTokens}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}

function placeNodes(nodes: CatalogElement[]): Map<string, { x: number; y: number }> {
  const counts = new Map<string, number>();
  const placed = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    if (node.type !== "FleetNode") continue;
    const used = counts.get(node.props.kind) ?? 0;
    counts.set(node.props.kind, used + 1);
    placed.set(node.props.nodeId, {
      x: columns[node.props.kind] ?? 70,
      y: 48 + used * 78,
    });
  }
  return placed;
}
