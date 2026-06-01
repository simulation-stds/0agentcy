import { PrimaryButton, SecondaryButton, SettingsSection, StatusBadge, ToolAccordionItem } from "@/components/app-controls";
import { Accordion } from "@/components/ui/accordion";
import type { FaceFusionStatus, ToolStatus, ToolStorage } from "@/hooks/use-tool-state";

type MustHaveEnvironmentsSectionProps = {
  tools: ToolStatus | null;
  expandedTool: string;
  isUpdatingMiniforge: boolean;
  hasMiniforgeUpdate: boolean;
  faceFusionStatus: FaceFusionStatus | null;
  gitDownloadUrl: string;
  storageFor: (key: string) => ToolStorage | undefined;
  onSetExpandedTool: (value: string) => void;
  onUpdateMiniforge: () => void;
  onOpenExternalDownload: (url: string) => void;
};

export function MustHaveEnvironmentsSection({
  tools,
  expandedTool,
  isUpdatingMiniforge,
  hasMiniforgeUpdate,
  faceFusionStatus,
  gitDownloadUrl,
  storageFor,
  onSetExpandedTool,
  onUpdateMiniforge,
  onOpenExternalDownload,
}: MustHaveEnvironmentsSectionProps) {
  const gitInstalled = Boolean(tools?.git);
  const condaInstalled = Boolean(tools?.conda);
  const condaStorage = tools?.conda
    ? `Tool folder: ${storageFor("miniforge")?.currentLabel || "Detected"}`
    : `Estimated: ${storageFor("miniforge")?.estimatedInstallLabel || "~700 MB-2 GB"}`;

  return (
    <SettingsSection title="Source & Environments" description="Support tools for installing source-based AI projects and keeping their Python dependencies isolated from the rest of your system.">
      <Accordion type="single" collapsible value={expandedTool} onValueChange={(value) => onSetExpandedTool(value || "")} className="settings-accordion">
        <ToolAccordionItem
          value="git"
          title="Git"
          badge={<StatusBadge tone={gitInstalled ? "installed" : "missing"}>{gitInstalled ? "Installed" : "Missing"}</StatusBadge>}
          summary={gitInstalled ? "Detected from system PATH" : "External install recommended"}
        >
          <p>Git is needed to clone and update source-based tools like FaceFusion. For v1, install Git for Windows normally so its SSL, SSH, and helper tools work as expected.</p>
          <div className="tool-dropdown-info">
            <code title={tools?.git || "Install Git for Windows and make git.exe available on PATH"}><span className="material-symbols-rounded" aria-hidden="true">folder</span>{tools?.git || "Missing from PATH"}</code>
          </div>
          {!gitInstalled && (
            <div className="tool-dropdown-actions external-only">
              <PrimaryButton onClick={() => onOpenExternalDownload(gitDownloadUrl)}><span className="material-symbols-rounded" aria-hidden="true">public</span>Download</PrimaryButton>
            </div>
          )}
        </ToolAccordionItem>

        <ToolAccordionItem
          value="miniforge"
          title="Miniforge / Conda"
          badge={<StatusBadge tone={condaInstalled ? "installed" : "missing"}>{condaInstalled ? "Installed" : "Missing"}</StatusBadge>}
          summary={condaStorage}
        >
          <p>Conda creates isolated Python environments for FaceFusion and future Python AI tools. The managed install lives in tools/miniforge and does not need to be added to PATH.</p>
          <p className="settings-note">Environment: {faceFusionStatus?.envName || "videotools-facefusion"}</p>
          <div className="tool-dropdown-info">
            <code title={tools?.conda || "D:/W2DS/Tools/videomaxxxing/tools/miniforge"}><span className="material-symbols-rounded" aria-hidden="true">folder</span>{tools?.conda || "D:/W2DS/Tools/videomaxxxing/tools/miniforge"}</code>
          </div>
          <div className="tool-dropdown-actions">
            {condaInstalled && hasMiniforgeUpdate && (
              <SecondaryButton disabled={isUpdatingMiniforge} onClick={onUpdateMiniforge}><span className="material-symbols-rounded" aria-hidden="true">sync</span>Update</SecondaryButton>
            )}
            {condaInstalled ? (
              <SecondaryButton disabled><span className="material-symbols-rounded" aria-hidden="true">delete</span>Uninstall</SecondaryButton>
            ) : (
              <PrimaryButton disabled={isUpdatingMiniforge} onClick={onUpdateMiniforge}><span className="material-symbols-rounded" aria-hidden="true">download</span>Download</PrimaryButton>
            )}
          </div>
        </ToolAccordionItem>
      </Accordion>
    </SettingsSection>
  );
}
