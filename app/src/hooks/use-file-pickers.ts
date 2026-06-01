import { useState, type Dispatch, type SetStateAction } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { AppSettings } from "@/lib/app-options";

type UseFilePickersArgs = {
  appSettings: AppSettings;
  setAppSettings: Dispatch<SetStateAction<AppSettings>>;
  saveSettings: (nextSettings?: AppSettings) => Promise<void>;
  appendLog: (message: string) => void;
};

export function useFilePickers({
  appSettings,
  setAppSettings,
  saveSettings,
  appendLog,
}: UseFilePickersArgs) {
  const [faceFusionSourcePath, setFaceFusionSourcePath] = useState("");

  async function chooseFaceFusionSource() {
    const selected = await openDialog({
      multiple: false,
      directory: false,
      filters: [
        {
          name: "Face source image",
          extensions: ["png", "jpg", "jpeg", "webp"],
        },
      ],
    });

    if (typeof selected === "string") {
      setFaceFusionSourcePath(selected);
      appendLog(`FaceFusion source: ${selected}`);
    }
  }

  async function chooseDefaultDownloadFolder() {
    const selected = await openDialog({
      multiple: false,
      directory: true,
    });

    if (typeof selected === "string") {
      const nextSettings = { ...appSettings, defaultDownloadFolder: selected };
      setAppSettings(nextSettings);
    }
  }

  async function chooseTempFolder() {
    const selected = await openDialog({
      multiple: false,
      directory: true,
    });

    if (typeof selected === "string") {
      setAppSettings({ ...appSettings, tempFolder: selected });
    }
  }

  async function chooseRuntimeFolder(field: "cudaBinFolder" | "cudnnBinFolder") {
    const selected = await openDialog({
      multiple: false,
      directory: true,
    });

    if (typeof selected === "string") {
      const nextSettings = { ...appSettings, [field]: selected };
      setAppSettings(nextSettings);
      await saveSettings(nextSettings);
    }
  }

  return {
    faceFusionSourcePath,
    chooseFaceFusionSource,
    chooseDefaultDownloadFolder,
    chooseTempFolder,
    chooseRuntimeFolder,
  };
}
