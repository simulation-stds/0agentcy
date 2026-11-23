import { PrimaryButton, SecondaryButton } from "@/components/app-controls";
import { Checkbox } from "@/components/ui/checkbox";
import { Download } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { useModelInstall } from "@/hooks/use-model-install";

type ModelInstallDialogProps = {
  modelInstall: ReturnType<typeof useModelInstall>;
  isInstalling: boolean;
};

export function ModelInstallDialog({
  modelInstall,
  isInstalling,
}: ModelInstallDialogProps) {
  return (
    <Dialog open={modelInstall.isModelInstallOpen} onOpenChange={(open) => modelInstall.setIsModelInstallOpen(open)}>
      <DialogContent className="settings-modal model-install-modal" showCloseButton>
        <DialogHeader className="settings-modal-header">
          <DialogTitle>
            {modelInstall.modelInstallTool === "realesrgan"
              ? "Install Real-ESRGAN Models"
              : "Install RIFE Models"}
          </DialogTitle>
          <DialogDescription>Select the bundled models to keep after install/update.</DialogDescription>
        </DialogHeader>
        <div className="install-model-list">
          {modelInstall.activeInstallCatalog.map((model) => (
            <label className="install-model-card" key={model.name}>
              <Checkbox checked={modelInstall.selectedInstallModels.includes(model.name)} onCheckedChange={() => modelInstall.toggleInstallModel(model.name)} />
              <div>
                <strong>{model.label}</strong>
                <code>{model.name} | {model.estimate}</code>
                <p>{model.description}</p>
              </div>
            </label>
          ))}
        </div>
        <DialogFooter className="modal-actions">
          <DialogClose asChild>
            <SecondaryButton>Cancel</SecondaryButton>
          </DialogClose>
          <PrimaryButton disabled={!modelInstall.selectedInstallModels.length || isInstalling} onClick={modelInstall.confirmModelInstall}>
            <Download />
            Install Selected
          </PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
