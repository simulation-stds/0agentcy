import { SecondaryButton } from "@/components/app-controls";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

type SettingsSidebarProps = {
  onCheckUpdates: () => void;
};

export function SettingsSidebar({ onCheckUpdates }: SettingsSidebarProps) {
  return (
    <div className="settings-sidebar">
      <TabsList className="settings-tabs" aria-label="Settings sections">
        <TabsTrigger value="general">
          <span className="material-symbols-rounded" aria-hidden="true">tune</span>
          General
        </TabsTrigger>
        <TabsTrigger value="must">
          <span className="material-symbols-rounded" aria-hidden="true">inventory_2</span>
          Must haves
        </TabsTrigger>
        <TabsTrigger value="video">
          <span className="material-symbols-rounded" aria-hidden="true">movie</span>
          Video
        </TabsTrigger>
        <TabsTrigger value="image">
          <span className="material-symbols-rounded" aria-hidden="true">image</span>
          Image
        </TabsTrigger>
        <TabsTrigger value="audio">
          <span className="material-symbols-rounded" aria-hidden="true">music_note</span>
          Audio
        </TabsTrigger>
      </TabsList>
      <SecondaryButton className="settings-check-button" onClick={onCheckUpdates}>
        <span className="material-symbols-rounded" aria-hidden="true">refresh</span>
        Check Updates
      </SecondaryButton>
    </div>
  );
}
