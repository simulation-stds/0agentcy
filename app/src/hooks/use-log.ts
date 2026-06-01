import { useCallback, useState } from "react";

export function useLog() {
  const [log, setLog] = useState<string[]>(["Simulation Studio ready. Choose a video or image to begin."]);
  const [jobProgress, setJobProgress] = useState(0);
  const [jobStep, setJobStep] = useState("Idle");

  const appendLog = useCallback((message: string) => {
    setLog((items) => [...items.slice(-80), message]);
  }, []);

  const resetJobProgress = useCallback(() => {
    setJobProgress(0);
    setJobStep("Idle");
  }, []);

  return {
    log,
    jobProgress,
    jobStep,
    appendLog,
    resetJobProgress,
    setJobProgress,
    setJobStep,
  };
}
