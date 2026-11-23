import { useCallback, useState } from "react";

export function useLog() {
  const [log, setLog] = useState<string[]>(["Simulation Studio ready. Choose a video or image to begin."]);
  const [notification, setNotification] = useState<{ id: number; outcome: "success" | "failure" } | null>(null);
  const [jobProgress, setJobProgress] = useState(0);
  const [jobStep, setJobStep] = useState("Idle");

  const appendLog = useCallback((message: string) => {
    setLog((items) => [...items.slice(-80), message]);
    const outcome = /^(Job failed:|Audio failed:|SUPIR failed:|VOSR failed:)/i.test(message) ? "failure"
      : /^(Done:|Audio complete:|SUPIR complete:|VOSR complete:)/i.test(message) ? "success" : null;
    if (outcome) {
      setNotification((previous) => ({ id: (previous?.id ?? 0) + 1, outcome }));
    }
  }, []);

  const resetJobProgress = useCallback(() => {
    setJobProgress(0);
    setJobStep("Idle");
  }, []);

  return {
    log,
    notification,
    jobProgress,
    jobStep,
    appendLog,
    resetJobProgress,
    setJobProgress,
    setJobStep,
  };
}
