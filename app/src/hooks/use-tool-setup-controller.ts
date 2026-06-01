import { useEffect } from "react";
import { useModelInstall } from "@/hooks/use-model-install";
import { useToolManagement } from "@/hooks/use-tool-management";
import type { useToolState } from "@/hooks/use-tool-state";

type UseToolSetupControllerArgs = {
  appendLog: (message: string) => void;
  faceFusionRuntime: string;
  toolState: ReturnType<typeof useToolState>;
};

export function useToolSetupController({
  appendLog,
  faceFusionRuntime,
  toolState,
}: UseToolSetupControllerArgs) {
  const { models, rifeModels } = toolState;

  useEffect(() => {
    toolState.refreshToolState();
  }, []);

  const toolManagement = useToolManagement({
    faceFusionRuntime,
    models,
    rifeModels,
    appendLog,
    refreshToolState: toolState.refreshToolState,
  });
  const modelInstall = useModelInstall({
    models,
    rifeModels,
    updateRealEsrgan: toolManagement.updateRealEsrgan,
    updateRife: toolManagement.updateRife,
  });

  return {
    toolManagement,
    modelInstall,
  };
}
