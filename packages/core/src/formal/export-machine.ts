import { machineToJSON } from "xstate";
import { flowMachine } from "../flow/machine.js";

export function flowMachineJson(): string {
  return JSON.stringify(machineToJSON(flowMachine));
}
