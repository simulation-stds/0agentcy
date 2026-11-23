import { SecondaryButton } from "@/components/app-controls";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClipboardList, Film, Image, Music, RefreshCw, SlidersHorizontal } from "lucide-react";

type SettingsSidebarProps = {
  onCheckUpdates: () => void;
};

export function SettingsSidebar({ onCheckUpdates }: SettingsSidebarProps) {
  return (
    <div className="settings-sidebar">
      <TabsList className="settings-tabs" aria-label="Settings sections">
        <TabsTrigger value="general">
          <SlidersHorizontal className="app-icon" />
          General
        </TabsTrigger>
        <TabsTrigger value="must">
          <ClipboardList className="app-icon" />
          Must haves
        </TabsTrigger>
        <TabsTrigger value="video">
          <Film className="app-icon" />
          Video
        </TabsTrigger>
        <TabsTrigger value="image">
          <Image className="app-icon" />
          Image
        </TabsTrigger>
        <TabsTrigger value="fonts">Fonts</TabsTrigger>
        <TabsTrigger value="audio">
          <Music className="app-icon" />
          Audio
        </TabsTrigger>
      </TabsList>
      <SecondaryButton className="settings-check-button" onClick={onCheckUpdates}>
        <RefreshCw className="app-icon" />
        Check Updates
      </SecondaryButton>
    </div>
  );
}
