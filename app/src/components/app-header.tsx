import { IconButton } from "@/components/app-controls";
import { Button } from "@/components/ui/button";
import type { ToolCategory } from "@/lib/app-options";
import logoGreen from "@/assets/logo_green.svg";

type AppHeaderProps = {
  appVersion: string;
  toolCategory: ToolCategory;
  allServicesAvailable: boolean;
  onSetToolCategory: (category: ToolCategory) => void;
  onOpenSettings: () => void;
};

export function AppHeader({
  appVersion,
  toolCategory,
  allServicesAvailable,
  onSetToolCategory,
  onOpenSettings,
}: AppHeaderProps) {
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <img src={logoGreen} alt="Simulation Studio" />
        <span className="brand-version">V {appVersion}</span>
      </div>
      <nav className="tool-switcher" aria-label="Tool type">
        <Button className={toolCategory === "video" ? "active" : ""} type="button" onClick={() => onSetToolCategory("video")}>
          <span className="material-symbols-rounded" aria-hidden="true">movie</span>
          Video
        </Button>
        <Button className={toolCategory === "image" ? "active" : ""} type="button" onClick={() => onSetToolCategory("image")}>
          <span className="material-symbols-rounded" aria-hidden="true">image</span>
          Image
        </Button>
        <Button className={toolCategory === "audio" ? "active" : ""} type="button" onClick={() => onSetToolCategory("audio")}>
          <span className="material-symbols-rounded" aria-hidden="true">music_note</span>
          Audio
        </Button>
      </nav>
      <div className="status-row">
        <span className={allServicesAvailable ? "pill ok" : "pill bad"}>
          {allServicesAvailable ? "All services available" : "Setup needed"}
        </span>
        <IconButton type="button" title="App settings" onClick={onOpenSettings}>
          <span className="material-symbols-rounded" aria-hidden="true">
            settings
          </span>
        </IconButton>
      </div>
    </header>
  );
}
