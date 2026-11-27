import { machineToJSON } from "xstate";
import { pilotMachine } from "../railway/pilot.js";

export function pilotMachineJson(): string {
  return JSON.stringify(machineToJSON(pilotMachine));
}
