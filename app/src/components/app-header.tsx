import { IconButton } from "@/components/app-controls";
import { Button } from "@/components/ui/button";
import type { ToolCategory } from "@/lib/app-options";
import logoGreen from "@/assets/logo_green.svg";
import { Film, Image, Music, Settings } from "lucide-react";

type AppHeaderProps = {
  appVersion: string;
  toolCategory: ToolCategory;
  allServicesAvailable: boolean;
  toolsChecked: boolean;
  onSetToolCategory: (category: ToolCategory) => void;
  onOpenSettings: () => void;
};

export function AppHeader({
  appVersion,
  toolCategory,
  allServicesAvailable,
  toolsChecked,
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
          <Film className="app-icon" />
          Video
        </Button>
        <Button className={toolCategory === "image" ? "active" : ""} type="button" onClick={() => onSetToolCategory("image")}>
          <Image className="app-icon" />
          Image
        </Button>
        <Button className={toolCategory === "audio" ? "active" : ""} type="button" onClick={() => onSetToolCategory("audio")}>
          <Music className="app-icon" />
          Audio
        </Button>
      </nav>
      <div className="status-row">
        <span className={!toolsChecked ? "pill" : allServicesAvailable ? "pill ok" : "pill bad"}>
          {!toolsChecked ? "Tools checked on demand" : allServicesAvailable ? "All services available" : "Setup needed"}
        </span>
        <IconButton type="button" title="App settings" onClick={onOpenSettings}>
          <Settings className="app-icon" />
        </IconButton>
      </div>
    </header>
  );
}
