import type { FlowMode } from "@visualizer/core";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@ui-sdk/react/dialog";

export default function SettingsDialog({
  open,
  mode,
  onOpenChange,
  onToggleMode,
}: {
  open: boolean;
  mode: FlowMode;
  onOpenChange: (open: boolean) => void;
  onToggleMode: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogBackdrop className="settings-backdrop" />
      <DialogContent className="settings-panel">
        <DialogTitle>Settings</DialogTitle>
        <button type="button" aria-pressed={mode === "advanced"} onClick={onToggleMode}>
          {mode === "simple" ? "Advanced" : "Simple"}
        </button>
        <DialogClose>Close</DialogClose>
      </DialogContent>
    </Dialog>
  );
}
