import { IconButton, PathButton, PrimaryButton, SecondaryButton, SwitchRow } from "@/components/app-controls";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type DetectedDeviceRow = {
  index: number;
  id: string;
  name: string;
  runtime: string;
};

export function GeneralSettings({
  defaultDownloadFolder,
  tempFolder,
  detectedDeviceRows,
  tab,
  hasUnsavedChanges,
  preferredModelDevice,
  playNotifications,
  showInfoIcons,
  onSelectTab,
  onSetPreferredModelDevice,
  onSetPlayNotifications,
  onSetShowInfoIcons,
  onChooseDefaultDownloadFolder,
  onChooseTempFolder,
  onFlushTempFolder,
  onSaveSettings,
}: {
  defaultDownloadFolder: string;
  tempFolder: string;
  detectedDeviceRows: DetectedDeviceRow[];
  tab: "folders" | "devices" | "interface";
  hasUnsavedChanges: boolean;
  preferredModelDevice: string;
  playNotifications: boolean;
  showInfoIcons: boolean;
  onSelectTab: (tab: "folders" | "devices" | "interface") => void;
  onSetPreferredModelDevice: (device: string) => void;
  onSetPlayNotifications: (checked: boolean) => void;
  onSetShowInfoIcons: (checked: boolean) => void;
  onChooseDefaultDownloadFolder: () => void;
  onChooseTempFolder: () => void;
  onFlushTempFolder: () => void;
  onSaveSettings: () => void;
}) {
  return (
    <>
      <h2>General</h2>
      <div className="settings-tab-shell">
        <Tabs value={tab} onValueChange={(value) => onSelectTab(value as "folders" | "devices" | "interface")} className="settings-inner-tabs-wrap">
          <TabsList variant="line" className="settings-inner-tabs" aria-label="General sections">
            <TabsTrigger value="folders">
              <span className="material-symbols-rounded" aria-hidden="true">folder</span>
              Folders
            </TabsTrigger>
            <TabsTrigger value="devices">
              <span className="material-symbols-rounded" aria-hidden="true">developer_board</span>
              Devices
            </TabsTrigger>
            <TabsTrigger value="interface">
              <span className="material-symbols-rounded" aria-hidden="true">dashboard_customize</span>
              Interface
            </TabsTrigger>
          </TabsList>

          <TabsContent value="folders" className="settings-tab-content">
            <div className="folder-settings-list">
              <section className="folder-settings-section">
                <h3>Downloads</h3>
                <PathButton onClick={onChooseDefaultDownloadFolder}>
                  <span className="material-symbols-rounded" aria-hidden="true">drive_folder_upload</span>
                  <span>{defaultDownloadFolder || "Choose default download folder"}</span>
                </PathButton>
              </section>

              <section className="folder-settings-section">
                <h3>Temp</h3>
                <div className="folder-action-row">
                  <PathButton type="button" onClick={onChooseTempFolder}>
                    <span className="material-symbols-rounded" aria-hidden="true">folder_open</span>
                    <span>{tempFolder || "Choose temp folder"}</span>
                  </PathButton>
                  <SecondaryButton type="button" className="flush-temp-button" onClick={onFlushTempFolder}>
                    <span className="material-symbols-rounded" aria-hidden="true">delete_sweep</span>
                    Flush Temp
                  </SecondaryButton>
                </div>
              </section>
            </div>
          </TabsContent>

          <TabsContent value="devices" className="settings-tab-content">
            <div className="device-list">
              {detectedDeviceRows.map((device) => {
                const isPreferred = preferredModelDevice === device.id || (!preferredModelDevice && device.id === "");
                return (
                  <div className="device-row" key={`${device.index}-${device.name}`}>
                    <IconButton
                      type="button"
                      className={`device-default-button ${isPreferred ? "active" : ""}`}
                      title={`Use ${device.name} by default`}
                      aria-label={`Use ${device.name} by default`}
                      onClick={() => onSetPreferredModelDevice(device.id)}
                    >
                      <span className="material-symbols-rounded" aria-hidden="true">{isPreferred ? "star" : "star"}</span>
                    </IconButton>
                    <span>{device.index}. {device.name}</span>
                    <span className={`runtime-chip ${device.runtime.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}>{device.runtime}</span>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="interface" className="settings-tab-content">
            <section className="folder-settings-section">
              <h3>Interface</h3>
              <SwitchRow
                checked={playNotifications}
                onCheckedChange={onSetPlayNotifications}
                help="Play a short sound when jobs complete successfully or fail."
              >
                Play notifications
              </SwitchRow>
              <SwitchRow
                checked={showInfoIcons}
                onCheckedChange={onSetShowInfoIcons}
                help="Show contextual help icons next to tool settings."
              >
                Show info icons
              </SwitchRow>
            </section>
          </TabsContent>
        </Tabs>
        <div className="settings-save-row">
          <PrimaryButton className={`general-save-button ${hasUnsavedChanges ? "is-dirty" : ""}`} disabled={!hasUnsavedChanges} onClick={onSaveSettings}>
            <span className="material-symbols-rounded" aria-hidden="true">save</span>
            Save General
          </PrimaryButton>
        </div>
      </div>
    </>
  );
}
