import { useEffect } from "react";
import { baseName, outputExtension, outputSuffix, socialExtension } from "@/lib/media-utils";

type ModelWithScale = {
  name: string;
  scale: string;
};

type UseOutputNameArgs = {
  inputPath: string;
  action: string;
  audioFormat: string;
  selectedModel: string;
  models: ModelWithScale[];
  rifeMultiplier: string;
  socialFormat: string;
  setOutputName: (value: string) => void;
};

export function useOutputName({
  inputPath,
  action,
  audioFormat,
  selectedModel,
  models,
  rifeMultiplier,
  socialFormat,
  setOutputName,
}: UseOutputNameArgs) {
  useEffect(() => {
    const selectedScale = models.find((item) => item.name === selectedModel)?.scale || "4";
    const suffix =
      action === "realesrgan_upscale"
        ? `upscaled_${selectedScale}x`
        : action === "social_export"
          ? `social_${socialFormat.replace("h264_", "")}`
          : action === "rife_interpolate"
              ? `rife_${rifeMultiplier}x`
              : outputSuffix(action, audioFormat);
    const extension =
      action === "social_export"
        ? socialExtension(socialFormat)
        : action === "realesrgan_upscale"
          ? ".mp4"
          : outputExtension(action, audioFormat);
    setOutputName(`${baseName(inputPath)}_${suffix}${extension}`);
  }, [inputPath, action, audioFormat, selectedModel, models, rifeMultiplier, socialFormat, setOutputName]);
}
