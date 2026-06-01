export function appendTailLog(appendLog: (message: string) => void, log: string) {
  if (log.trim()) {
    appendLog(log.trim().split(/\r?\n/).slice(-8).join("\n"));
  }
}
