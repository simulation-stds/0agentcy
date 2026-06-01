import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { listen } from "@tauri-apps/api/event";
import { formatProgressEvent } from "@/lib/media-utils";

type ProgressEvent = {
  stage: string;
  message: string;
  progress?: number | null;
  step?: string | null;
};

type UseAppLifecycleArgs = {
  appendLog: (message: string) => void;
  setJobProgress: Dispatch<SetStateAction<number>>;
  setJobStep: Dispatch<SetStateAction<string>>;
};

export function useAppLifecycle({ appendLog, setJobProgress, setJobStep }: UseAppLifecycleArgs) {
  useEffect(() => {
    if (!(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
      return;
    }
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    listen<ProgressEvent>("upscale-progress", (event) => {
      const progress = progressFromEvent(event.payload);
      if (progress !== null) {
        setJobProgress(progress);
      }
      setJobStep(stepFromEvent(event.payload));
      appendLog(formatProgressEvent(event.payload));
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
        return;
      }
      cleanup = unlisten;
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [appendLog, setJobProgress, setJobStep]);
}

function progressFromEvent(event: ProgressEvent) {
  if (typeof event.progress === "number" && Number.isFinite(event.progress)) {
    return Math.max(0, Math.min(100, event.progress));
  }

  const normalized = `${event.stage} ${event.message}`.toLowerCase();
  if (normalized.includes("cancel") || normalized.includes("failed")) return 0;
  if (
    normalized.includes("output:") ||
    normalized.includes("done") ||
    normalized.includes("complete") ||
    normalized.includes("finished")
  ) return 100;
  if (
    normalized.includes("started") ||
    normalized.includes("temp files") ||
    normalized.includes("preparing") ||
    normalized.includes("checking")
  ) return 5;
  return null;
}

function stepFromEvent(event: ProgressEvent) {
  const explicitStep = event.step?.trim();
  if (explicitStep) return explicitStep;

  const normalized = `${event.stage} ${event.message}`.toLowerCase();
  if (normalized.includes("cancel")) return "Cancelled";
  if (normalized.includes("failed")) return "Failed";
  if (normalized.includes("output:") || normalized.includes("done") || normalized.includes("complete")) {
    return "Complete";
  }
  return event.stage;
}
