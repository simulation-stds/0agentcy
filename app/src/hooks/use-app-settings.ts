import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { defaultAppSettings, type AppSettings } from "@/lib/app-options";

type JobResult = {
  outputPath: string;
  log: string;
};

function normalizeSettings(settings: AppSettings): AppSettings {
  return { ...defaultAppSettings, ...settings };
}

export function useAppSettings(appendLog: (message: string) => void) {
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultAppSettings);
  const [savedAppSettings, setSavedAppSettings] = useState<AppSettings>(defaultAppSettings);

  useEffect(() => {
    invoke<AppSettings>("get_app_settings")
      .then((settings) => {
        const normalized = normalizeSettings(settings);
        setAppSettings(normalized);
        setSavedAppSettings(normalized);
      })
      .catch((error) => appendLog(`Settings load failed: ${String(error)}`));
  }, []);

  async function saveSettings(nextSettings = appSettings) {
    try {
      const saved = await invoke<AppSettings>("save_app_settings", { settings: nextSettings });
      const normalized = normalizeSettings(saved);
      setAppSettings(normalized);
      setSavedAppSettings(normalized);
      appendLog("Settings saved.");
    } catch (error) {
      appendLog(`Settings save failed: ${String(error).trim()}`);
    }
  }

  function updateAppSettings(patch: Partial<AppSettings>) {
    setAppSettings((current) => ({ ...current, ...patch }));
  }

  async function openExternalDownload(url: string) {
    try {
      await openUrl(url);
    } catch (error) {
      appendLog(`Could not open download URL: ${String(error).trim()}`);
    }
  }

  async function flushTempFolder() {
    try {
      const result = await invoke<JobResult>("flush_temp_folder");
      appendLog(result.log);
    } catch (error) {
      appendLog(`Temp flush failed: ${String(error).trim()}`);
    }
  }

  return {
    appSettings,
    savedAppSettings,
    hasUnsavedSettings: JSON.stringify(appSettings) !== JSON.stringify(savedAppSettings),
    setAppSettings,
    saveSettings,
    updateAppSettings,
    openExternalDownload,
    flushTempFolder,
  };
}
