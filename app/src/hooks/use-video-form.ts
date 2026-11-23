import { useEffect, useState } from "react";
import { useOutputName } from "@/hooks/use-output-name";
import type { RealEsrganModel, RifeModel } from "@/hooks/use-tool-state";

type UseVideoFormArgs = {
  inputPath: string;
  models: RealEsrganModel[];
  rifeModels: RifeModel[];
};

export function useVideoForm({ inputPath, models, rifeModels }: UseVideoFormArgs) {
  const [action, setAction] = useState("trim_mp4");
  const [contactSheetFrameCount, setContactSheetFrameCount] = useState("12");
  const [contactSheetResolution, setContactSheetResolution] = useState("640");
  const [audioFormat, setAudioFormat] = useState("mp3");
  const [socialFormat, setSocialFormat] = useState("h264_mp4");
  const [socialFps, setSocialFps] = useState("24");
  const [socialWidth, setSocialWidth] = useState("1280");
  const [socialLoop, setSocialLoop] = useState(true);
  const [socialScaleFilter, setSocialScaleFilter] = useState("lanczos");
  const [socialCrf, setSocialCrf] = useState("18");
  const [socialQuality, setSocialQuality] = useState("90");
  const [socialPreset, setSocialPreset] = useState("veryslow");
  const [socialIncludeAudio, setSocialIncludeAudio] = useState(false);
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedRifeModel, setSelectedRifeModel] = useState("");
  const [selectedDevice, setSelectedDevice] = useState("");
  const [rifeMultiplier, setRifeMultiplier] = useState("2");
  const [crf, setCrf] = useState("18");
  const [encoderPreset, setEncoderPreset] = useState("medium");
  const [tileSize, setTileSize] = useState("0");
  const [threads, setThreads] = useState("1:2:2");
  const [rifeTtaSpatial, setRifeTtaSpatial] = useState(false);
  const [rifeTtaTemporal, setRifeTtaTemporal] = useState(false);
  const [rifeUhd, setRifeUhd] = useState(false);
  const [faceFusionProcessor, setFaceFusionProcessor] = useState("swap_enhance");
  const [faceFusionProvider, setFaceFusionProvider] = useState("directml");
  const [faceFusionRuntime, setFaceFusionRuntime] = useState("directml");
  const [wan21Prompt, setWan21Prompt] = useState("");
  const [wan21Orientation, setWan21Orientation] = useState("horizontal");
  const [wan21Size, setWan21Size] = useState("832*480");
  const [wan21FrameCount, setWan21FrameCount] = useState("25");
  const [wan21Steps, setWan21Steps] = useState("10");
  const [wan21Guidance, setWan21Guidance] = useState("6");
  const [wan21Seed, setWan21Seed] = useState("");
  const [wan21OffloadModel, setWan21OffloadModel] = useState(true);
  const [wan21T5Cpu, setWan21T5Cpu] = useState(true);
  const [wan22Prompt, setWan22Prompt] = useState("");
  const [wan22Orientation, setWan22Orientation] = useState("horizontal");
  const [wan22Size, setWan22Size] = useState("1280*704");
  const [wan22FrameCount, setWan22FrameCount] = useState("49");
  const [wan22Steps, setWan22Steps] = useState("40");
  const [wan22Guidance, setWan22Guidance] = useState("5");
  const [wan22Seed, setWan22Seed] = useState("");
  const [wan22OffloadModel, setWan22OffloadModel] = useState(true);
  const [wan22ConvertModelDtype, setWan22ConvertModelDtype] = useState(true);
  const [wan22T5Cpu, setWan22T5Cpu] = useState(true);
  const [outputName, setOutputName] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    setSelectedModel((current) => models.some(model => model.name === current) ? current : models.find(model => model.name === "realesr-animevideov3-x2")?.name || models[0]?.name || "");
  }, [models]);

  useEffect(() => {
    setSelectedRifeModel((current) => current || rifeModels.find((item) => item.name === "rife-v4.6")?.name || rifeModels[0]?.name || "");
  }, [rifeModels]);

  useOutputName({
    inputPath,
    action,
    audioFormat,
    selectedModel,
    models,
    rifeMultiplier,
    socialFormat,
    setOutputName,
  });

  useEffect(() => {
    setWan22Size(wan22Orientation === "vertical" ? "704*1280" : "1280*704");
  }, [wan22Orientation]);

  useEffect(() => {
    setWan21Size(wan21Orientation === "vertical" ? "480*832" : "832*480");
  }, [wan21Orientation]);

  return {
    action,
    contactSheetFrameCount,
    setContactSheetFrameCount,
    contactSheetResolution,
    setContactSheetResolution,
    audioFormat,
    socialFormat,
    socialFps,
    socialWidth,
    socialLoop,
    socialScaleFilter,
    socialCrf,
    socialQuality,
    socialPreset,
    socialIncludeAudio,
    selectedModel,
    selectedRifeModel,
    selectedDevice,
    rifeMultiplier,
    crf,
    encoderPreset,
    tileSize,
    threads,
    rifeTtaSpatial,
    rifeTtaTemporal,
    rifeUhd,
    faceFusionProcessor,
    faceFusionProvider,
    faceFusionRuntime,
    wan21Prompt,
    wan21Orientation,
    wan21Size,
    wan21FrameCount,
    wan21Steps,
    wan21Guidance,
    wan21Seed,
    wan21OffloadModel,
    wan21T5Cpu,
    wan22Prompt,
    wan22Orientation,
    wan22Size,
    wan22FrameCount,
    wan22Steps,
    wan22Guidance,
    wan22Seed,
    wan22OffloadModel,
    wan22ConvertModelDtype,
    wan22T5Cpu,
    outputName,
    isRunning,
    setAction,
    setAudioFormat,
    setSocialFormat,
    setSocialFps,
    setSocialWidth,
    setSocialLoop,
    setSocialScaleFilter,
    setSocialCrf,
    setSocialQuality,
    setSocialPreset,
    setSocialIncludeAudio,
    setSelectedModel,
    setSelectedRifeModel,
    setSelectedDevice,
    setRifeMultiplier,
    setCrf,
    setEncoderPreset,
    setTileSize,
    setThreads,
    setRifeTtaSpatial,
    setRifeTtaTemporal,
    setRifeUhd,
    setFaceFusionProcessor,
    setFaceFusionProvider,
    setFaceFusionRuntime,
    setWan21Prompt,
    setWan21Orientation,
    setWan21Size,
    setWan21FrameCount,
    setWan21Steps,
    setWan21Guidance,
    setWan21Seed,
    setWan21OffloadModel,
    setWan21T5Cpu,
    setWan22Prompt,
    setWan22Orientation,
    setWan22Size,
    setWan22FrameCount,
    setWan22Steps,
    setWan22Guidance,
    setWan22Seed,
    setWan22OffloadModel,
    setWan22ConvertModelDtype,
    setWan22T5Cpu,
    setOutputName,
    setIsRunning,
  };
}
