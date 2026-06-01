import { type Dispatch, type RefObject, type SetStateAction } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PaletteResult, PaletteSettings } from "@/lib/app-options";

type JobResult = {
  outputPath: string;
  log: string;
};

type UsePaletteActionsArgs = {
  paletteResult: PaletteResult | null;
  paletteCanvasRef: RefObject<HTMLCanvasElement | null>;
  imageName: string;
  outputName: string;
  appendLog: (message: string) => void;
  setPaletteSettings: Dispatch<SetStateAction<PaletteSettings>>;
  setPaletteStatus: Dispatch<SetStateAction<string>>;
};

export function usePaletteActions({
  paletteResult,
  paletteCanvasRef,
  imageName,
  outputName,
  appendLog,
  setPaletteSettings,
  setPaletteStatus,
}: UsePaletteActionsArgs) {
  function updatePaletteSettings(patch: Partial<PaletteSettings>) {
    setPaletteSettings((current) => ({ ...current, ...patch }));
  }

  async function copyPaletteCss() {
    if (!paletteResult) return;
    try {
      await navigator.clipboard.writeText(paletteResult.css);
      setPaletteStatus("CSS copied.");
      appendLog("Palette: CSS copied.");
    } catch (error) {
      const message = `CSS copy failed: ${String(error)}`;
      setPaletteStatus(message);
      appendLog(message);
    }
  }

  function downloadPaletteCss() {
    if (!paletteResult) return;
    invoke<JobResult>("save_text_to_downloads", {
      outputName: imageOutputName(outputName, imageName, "palette", "css"),
      text: paletteResult.css,
    })
      .then((result) => {
        setPaletteStatus(`Saved ${result.outputPath}`);
        appendLog(result.log);
      })
      .catch((error) => {
        const message = `CSS save failed: ${String(error)}`;
        setPaletteStatus(message);
        appendLog(message);
      });
  }

  function downloadPaletteSheet() {
    const canvas = paletteCanvasRef.current;
    if (!canvas || !paletteResult) return;
    invoke<JobResult>("save_data_url_to_downloads", {
      outputName: imageOutputName(outputName, imageName, "palette_sheet", "png"),
      dataUrl: canvas.toDataURL("image/png"),
    })
      .then((result) => {
        setPaletteStatus(`Saved ${result.outputPath}`);
        appendLog(result.log);
      })
      .catch((error) => {
        const message = `Palette sheet save failed: ${String(error)}`;
        setPaletteStatus(message);
        appendLog(message);
      });
  }

  return {
    updatePaletteSettings,
    copyPaletteCss,
    downloadPaletteCss,
    downloadPaletteSheet,
  };
}

function imageOutputName(name: string, imageName: string, suffix: string, extension: string) {
  const base = (name || `${imageName || "image"}_${suffix}`).trim() || `image_${suffix}`;
  return base.toLowerCase().endsWith(`.${extension}`) ? base : `${base}.${extension}`;
}
