import { PrimaryButton, SecondaryButton, SettingsSection, StatusBadge, ToolAccordionItem } from "@/components/app-controls";
import { Accordion } from "@/components/ui/accordion";
import type { ToolStatus, ToolStorage } from "@/hooks/use-tool-state";

type MustHaveToolsSectionProps = {
  tools: ToolStatus | null;
  expandedTool: string;
  isUpdatingFfmpeg: boolean;
  isUpdatingImageMagick: boolean;
  hasFfmpegUpdate: boolean;
  hasImageMagickUpdate: boolean;
  storageFor: (key: string) => ToolStorage | undefined;
  onSetExpandedTool: (value: string) => void;
  onUpdateFfmpeg: () => void;
  onUpdateImageMagick: () => void;
  onDeleteImageMagick: () => void;
};

export function MustHaveToolsSection({
  tools,
  expandedTool,
  isUpdatingFfmpeg,
  isUpdatingImageMagick,
  hasFfmpegUpdate,
  hasImageMagickUpdate,
  storageFor,
  onSetExpandedTool,
  onUpdateFfmpeg,
  onUpdateImageMagick,
  onDeleteImageMagick,
}: MustHaveToolsSectionProps) {
  const ffmpegInstalled = Boolean(tools?.ffmpeg && tools?.ffprobe);
  const imageMagickPath = tools?.imagemagick || "";
  const imageMagickManaged = isManagedImageMagickPath(imageMagickPath);
  const imageMagickAvailable = Boolean(imageMagickPath);
  const ffmpegStorage = ffmpegInstalled
    ? `Tool folder: ${storageFor("ffmpeg")?.currentLabel || "0 B"}`
    : `Estimated: ${storageFor("ffmpeg")?.estimatedInstallLabel || "~250-450 MB"}`;
  const imageMagickStorage = imageMagickManaged
    ? `Tool folder: ${storageFor("imagemagick")?.currentLabel || "0 B"}`
    : imageMagickAvailable
      ? "External system install"
      : `Estimated: ${storageFor("imagemagick")?.estimatedInstallLabel || "~80-250 MB"}`;

  return (
    <SettingsSection title="Tools" description="Core command-line utilities used directly by the app for media inspection, conversion, and export.">
      <Accordion type="single" collapsible value={expandedTool} onValueChange={(value) => onSetExpandedTool(value || "")} className="settings-accordion">
        <ToolAccordionItem
          value="ffmpeg"
          title="FFmpeg"
          badge={<StatusBadge tone={ffmpegInstalled ? "installed" : "missing"}>{ffmpegInstalled ? "Installed" : "Missing"}</StatusBadge>}
          summary={ffmpegStorage}
        >
          <p>FFmpeg includes ffmpeg.exe and ffprobe.exe. The app uses FFmpeg for processing and FFprobe for metadata.</p>
          <div className="tool-dropdown-info">
            <code title={tools?.ffmpeg || "D:/W2DS/Tools/videomaxxxing/tools/ffmpeg"}><span className="material-symbols-rounded" aria-hidden="true">folder</span>{tools?.ffmpeg || "D:/W2DS/Tools/videomaxxxing/tools/ffmpeg"}</code>
          </div>
          <div className="tool-dropdown-actions">
            {ffmpegInstalled && hasFfmpegUpdate && (
              <SecondaryButton disabled={isUpdatingFfmpeg} onClick={onUpdateFfmpeg}><span className="material-symbols-rounded" aria-hidden="true">sync</span>Update</SecondaryButton>
            )}
            {ffmpegInstalled ? (
              <SecondaryButton disabled><span className="material-symbols-rounded" aria-hidden="true">delete</span>Uninstall</SecondaryButton>
            ) : (
              <PrimaryButton disabled={isUpdatingFfmpeg} onClick={onUpdateFfmpeg}><span className="material-symbols-rounded" aria-hidden="true">download</span>Download</PrimaryButton>
            )}
          </div>
        </ToolAccordionItem>
        <ToolAccordionItem
          value="imagemagick"
          title="ImageMagick"
          badge={
            imageMagickAvailable ? (
              <>
                <StatusBadge tone="installed">Installed</StatusBadge>
                {!imageMagickManaged && <StatusBadge tone="local">System</StatusBadge>}
              </>
            ) : (
              <StatusBadge tone="missing">Missing</StatusBadge>
            )
          }
          summary={imageMagickStorage}
        >
          <p>ImageMagick provides the default still-image compressor and converter. Advanced codec tools override it when they are installed.</p>
          <div className="tool-dropdown-info">
            <code title={imageMagickPath || "D:/W2DS/Tools/videomaxxxing/tools/imagemagick"}><span className="material-symbols-rounded" aria-hidden="true">folder</span>{imageMagickPath || "D:/W2DS/Tools/videomaxxxing/tools/imagemagick"}</code>
          </div>
          <div className="tool-dropdown-actions">
            {!imageMagickAvailable && (
              <PrimaryButton disabled={isUpdatingImageMagick} onClick={onUpdateImageMagick}><span className="material-symbols-rounded" aria-hidden="true">download</span>Download</PrimaryButton>
            )}
            {imageMagickManaged && hasImageMagickUpdate && (
              <SecondaryButton disabled={isUpdatingImageMagick} onClick={onUpdateImageMagick}><span className="material-symbols-rounded" aria-hidden="true">sync</span>Update</SecondaryButton>
            )}
            {imageMagickManaged && (
              <SecondaryButton disabled={isUpdatingImageMagick} onClick={onDeleteImageMagick}><span className="material-symbols-rounded" aria-hidden="true">delete</span>Uninstall</SecondaryButton>
            )}
          </div>
        </ToolAccordionItem>
      </Accordion>
    </SettingsSection>
  );
}

function isManagedImageMagickPath(path: string) {
  return path.replace(/\\/g, "/").toLowerCase().includes("/tools/imagemagick/");
}
