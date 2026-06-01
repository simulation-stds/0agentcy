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
  const [outputName, setOutputName] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    setSelectedModel((current) => current || models[0]?.name || "");
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

  return {
    action,
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
    setOutputName,
    setIsRunning,
  };
}
