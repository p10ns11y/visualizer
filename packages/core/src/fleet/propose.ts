import { WorkspaceStateSchema, type FleetProposal, type WorkspaceState } from "../state/schema.js";
import type { CommitResult } from "../state/store.js";
import { fleetActionById } from "./actions.js";

function sameOrConflict(state: WorkspaceState, expectedVersion: number): CommitResult {
  if (expectedVersion !== state.stateVersion) {
    return {
      ok: false,
      error: {
        code: "STATE_CONFLICT",
        expectedVersion,
        actualVersion: state.stateVersion,
      },
    };
  }
  return { ok: true, state };
}

function commitAux(
  state: WorkspaceState,
  expectedVersion: number,
  mutate: (draft: WorkspaceState) => WorkspaceState,
  message: string,
): CommitResult {
  if (expectedVersion !== state.stateVersion) return sameOrConflict(state, expectedVersion);
  const edited = mutate(structuredClone(state));
  const logSeq = state.logSeq + 1;
  return {
    ok: true,
    state: WorkspaceStateSchema.parse({
      ...edited,
      stateVersion: state.stateVersion,
      autopilot: state.autopilot,
      logSeq,
      eventLog: [
        ...state.eventLog,
        {
          id: `log-${logSeq}`,
          stateVersion: state.stateVersion,
          kind: "memory",
          message,
        },
      ],
    }),
  };
}

export function proposeFleetAction(
  state: WorkspaceState,
  expectedVersion: number,
  actionId: string,
  createdAt: string,
): CommitResult | { ok: false; code: "UNKNOWN_ACTION"; actionId: string } {
  const action = fleetActionById(state.fleetGraph, actionId);
  if (!action) return { ok: false, code: "UNKNOWN_ACTION", actionId };
  if (state.fleetProposals.some((proposal) => proposal.actionId === action.id && proposal.status === "pending")) {
    return sameOrConflict(state, expectedVersion);
  }
  const proposal: FleetProposal = {
    id: `proposal-${state.logSeq + 1}`,
    actionId: action.id,
    kind: action.kind,
    summary: action.summary,
    status: "pending",
    subjectIds: action.subjectIds,
    createdAt,
  };
  return commitAux(
    state,
    expectedVersion,
    (draft) => ({
      ...draft,
      fleetGraph: state.fleetGraph,
      fleetProposals: [...draft.fleetProposals, proposal],
    }),
    `Filed pending fleet proposal ${proposal.id} for ${proposal.actionId}.`,
  );
}

export function decideFleetProposal(
  state: WorkspaceState,
  expectedVersion: number,
  proposalId: string,
  status: "approved" | "rejected",
): CommitResult {
  const current = state.fleetProposals.find((proposal) => proposal.id === proposalId);
  if (!current || current.status !== "pending") return sameOrConflict(state, expectedVersion);
  return commitAux(
    state,
    expectedVersion,
    (draft) => ({
      ...draft,
      fleetGraph: state.fleetGraph,
      fleetProposals: draft.fleetProposals.map((proposal) =>
        proposal.id === proposalId ? { ...proposal, status } : proposal,
      ),
    }),
    `Marked fleet proposal ${proposalId} ${status}. The fleet graph was not changed.`,
  );
}
