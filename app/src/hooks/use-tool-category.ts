import { useState } from "react";
import type { ToolCategory } from "@/lib/app-options";

export function useToolCategory() {
  const [toolCategory, setToolCategory] = useState<ToolCategory>("video");

  return {
    toolCategory,
    setToolCategory,
  };
}
