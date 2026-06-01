import { useEffect, useState } from "react";

type MustHaveTab = "tools" | "environments" | "gpu";
type GeneralTab = "folders" | "devices" | "interface";
type ModelTab = "editing" | "generative";

export function useSettingsState() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("general");
  const [mustHaveTab, setMustHaveTab] = useState<MustHaveTab>("tools");
  const [generalTab, setGeneralTab] = useState<GeneralTab>("folders");
  const [modelTab, setModelTab] = useState<ModelTab>("editing");
  const [expandedTool, setExpandedTool] = useState("");

  useEffect(() => {
    if (isSettingsOpen) {
      setExpandedTool("");
    }
  }, [isSettingsOpen, settingsTab]);

  function selectMustHaveTab(tab: MustHaveTab) {
    setMustHaveTab(tab);
    setExpandedTool("");
  }

  function selectGeneralTab(tab: GeneralTab) {
    setGeneralTab(tab);
  }

  function selectModelTab(tab: ModelTab) {
    setModelTab(tab);
    setExpandedTool("");
  }

  return {
    isSettingsOpen,
    settingsTab,
    mustHaveTab,
    generalTab,
    modelTab,
    expandedTool,
    setIsSettingsOpen,
    setSettingsTab,
    setExpandedTool,
    selectGeneralTab,
    selectMustHaveTab,
    selectModelTab,
  };
}
