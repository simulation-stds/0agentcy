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
  const [wan22ReferencePath, setWan22ReferencePath] = useState("");

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

  async function chooseWan22Reference() {
    const selected = await openDialog({
      multiple: false,
      directory: false,
      filters: [
        {
          name: "Wan2.2 reference image",
          extensions: ["png", "jpg", "jpeg", "webp", "bmp"],
        },
      ],
    });

    if (typeof selected === "string") {
      setWan22ReferencePath(selected);
      appendLog(`Wan2.2 reference image: ${selected}`);
    }
  }

  function clearWan22Reference() {
    setWan22ReferencePath("");
    appendLog("Wan2.2 reference image cleared.");
  }

  function setWan22Reference(path: string) {
    setWan22ReferencePath(path);
    appendLog(`Wan2.2 reference image: ${path}`);
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
    wan22ReferencePath,
    chooseFaceFusionSource,
    chooseWan22Reference,
    setWan22Reference,
    clearWan22Reference,
    chooseDefaultDownloadFolder,
    chooseTempFolder,
    chooseRuntimeFolder,
  };
}
