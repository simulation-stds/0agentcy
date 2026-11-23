import { createContext } from "react";
import type { CheckState, ToolKey } from "@/hooks/use-tool-state";

export const ToolCheckContext = createContext<{
  checks: Record<string, CheckState>;
  retry: (tool: ToolKey) => void;
} | null>(null);
