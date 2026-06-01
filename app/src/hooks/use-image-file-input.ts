import { useEffect, useMemo, useState, type DragEvent } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { baseName, localAssetSrc } from "@/lib/media-utils";

export type ImageDimensions = {
  width: number;
  height: number;
};

type UseImageFileInputArgs = {
  appendLog: (message: string) => void;
  resetJobProgress: () => void;
  onImageLoaded: (loadedLabel: string) => void;
};

export function useImageFileInput({
  appendLog,
  resetJobProgress,
  onImageLoaded,
}: UseImageFileInputArgs) {
  const [imagePath, setImagePath] = useState("");
  const [imageObjectUrl, setImageObjectUrl] = useState("");
  const [imageName, setImageName] = useState("");
  const [imageDimensions, setImageDimensions] = useState<ImageDimensions | null>(null);
  const [isAnimatedGif, setIsAnimatedGif] = useState(false);

  const imageSrc = useMemo(() => {
    if (imageObjectUrl) return imageObjectUrl;
    return localAssetSrc(imagePath);
  }, [imageObjectUrl, imagePath]);

  useEffect(() => {
    return () => {
      if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
    };
  }, [imageObjectUrl]);

  useEffect(() => {
    if (!imageSrc) {
      setImageDimensions(null);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      setImageDimensions({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.onerror = () => {
      if (!cancelled) setImageDimensions(null);
    };
    image.crossOrigin = imageSrc.startsWith("blob:") || imageSrc.startsWith("data:") ? "" : "anonymous";
    image.src = imageSrc;
    return () => {
      cancelled = true;
    };
  }, [imageSrc]);

  async function chooseInputImage() {
    const selected = await openDialog({
      multiple: false,
      directory: false,
      filters: [
        {
          name: "Image",
          extensions: ["png", "jpg", "jpeg", "gif", "bmp", "webp", "avif", "apng"],
        },
      ],
    });

    if (typeof selected === "string") {
      resetJobProgress();
      setImagePath(selected);
      setImageObjectUrl("");
      setImageName(baseName(selected));
      setIsAnimatedGif(/\.gif$/i.test(selected));
      onImageLoaded(selected);
      appendLog(`Image: loaded ${selected}`);
    }
  }

  async function handleImageDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0] as (File & { path?: string }) | undefined;
    if (!file) return;

    if (!file.type.startsWith("image/") && !/\.(png|jpe?g|gif|bmp|webp|avif|apng)$/i.test(file.name)) {
      appendLog("Dropped file is not an image.");
      return;
    }

    resetJobProgress();
    const objectUrl = URL.createObjectURL(file);
    setImageObjectUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return objectUrl;
    });
    setImagePath(file.path || "");
    setImageName(baseName(file.path || file.name));
    setIsAnimatedGif(/\.gif$/i.test(file.name));
    onImageLoaded(file.name);
    appendLog(`Image: loaded ${file.name}`);
  }

  return {
    imagePath,
    imageSrc,
    imageObjectUrl,
    imageName,
    imageDimensions,
    isAnimatedGif,
    chooseInputImage,
    handleImageDrop,
  };
}
