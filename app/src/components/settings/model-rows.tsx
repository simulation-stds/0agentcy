import { IconButton } from "@/components/app-controls";
import type { ModelSettingsRow, ModelTool } from "@/lib/app-options";
import { Download, Trash2 } from "lucide-react";

type ModelRowsProps = {
  tool: ModelTool;
  rows: ModelSettingsRow[];
  basicModel: string;
  onDeleteModel: (tool: ModelTool, model: string) => void;
  onDownloadModel: (models: string[]) => void;
};

export function ModelRows({
  tool,
  rows,
  basicModel,
  onDeleteModel,
  onDownloadModel,
}: ModelRowsProps) {
  return (
    <div className="model-list">
      {rows.map((candidate) => {
        const installed = candidate.installed;
        return (
          <div className="tool-component-row" key={candidate.name}>
            <div>
              <span className="model-title-row">
                <strong>{candidate.name}</strong>
                <span className={`status-chip ${installed ? "installed" : "missing"}`}>{installed ? "Installed" : "Missing"}</span>
                {candidate.name === basicModel && <span className="status-chip suggested">Suggested</span>}
                {!candidate.known && <span className="status-chip local">Local</span>}
              </span>
              <span>{installed?.description || candidate.description}</span>
            </div>
            <code>{installed ? `Installed: ${installed.sizeLabel}` : `Estimated: ${candidate.estimate}`}</code>
            <IconButton
              className={`icon-button ${installed ? "danger" : ""}`}
              disabled={!installed && !candidate.known}
              title={installed ? `Remove ${candidate.name}` : candidate.known ? `Download ${candidate.name}` : "Local model cannot be downloaded by this installer"}
              onClick={() => (installed ? onDeleteModel(tool, candidate.name) : onDownloadModel([candidate.name]))}
            >
              {installed ? <Trash2 className="app-icon" /> : <Download className="app-icon" />}
            </IconButton>
          </div>
        );
      })}
    </div>
  );
}
