import type { DragEvent } from "react";
import { PrimaryButton, SelectControl } from "@/components/app-controls";

export function ImageDropZone({
  imageSrc,
  imageName,
  imagePath,
  imageObjectUrl,
  onDrop,
  onChooseInputImage,
}: {
  imageSrc: string;
  imageName: string;
  imagePath: string;
  imageObjectUrl: string;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onChooseInputImage: () => void;
}) {
  return (
    <section className="drop-zone" onDrop={onDrop} onDragOver={(event) => event.preventDefault()}>
      {imageSrc ? (
        <img className="drop-preview" src={imageSrc} alt="" />
      ) : (
        <span className="material-symbols-rounded" aria-hidden="true">image</span>
      )}
      <strong>{imageName || "Choose an image"}</strong>
      {!imagePath && !imageObjectUrl && <p>Drop an image here or browse from Explorer.</p>}
      <PrimaryButton type="button" onClick={onChooseInputImage}>
        <span className="material-symbols-rounded" aria-hidden="true">folder_open</span>
        Browse Image
      </PrimaryButton>
    </section>
  );
}

export function ImageActionPanel({
  imageAction,
  onSetImageAction,
}: {
  imageAction: string;
  onSetImageAction: (value: string) => void;
}) {
  return (
    <div className="panel">
      <h2>Action</h2>
      <SelectControl value={imageAction} onChange={onSetImageAction} options={[
        { value: "dither", label: "Dither" },
        { value: "compress", label: "Compressor" },
        { value: "palette", label: "Palette Extractor" },
        { value: "supir", label: "SUPIR Restore" },
      ]} />
    </div>
  );
}
