import type { DragEvent } from "react";
import { PrimaryButton, SelectControl } from "@/components/app-controls";
import type { GenerativeReferenceItem } from "@/components/generative-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FolderOpen, Image, Trash2 } from "lucide-react";

export function ImageDropZone({
  imageSrc,
  imageName,
  imagePath,
  imageObjectUrl,
  isGenerative,
  disabled,
  references = [],
  onDrop,
  onChooseInputImage,
  onRemoveReference,
}: {
  imageSrc: string;
  imageName: string;
  imagePath: string;
  imageObjectUrl: string;
  isGenerative?: boolean;
  disabled?: boolean;
  references?: GenerativeReferenceItem[];
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onChooseInputImage: () => void;
  onRemoveReference?: (id: string) => void;
}) {
  const hasGenerativeReferences = isGenerative && references.length > 0;

  return (
    <section
      className="drop-zone"
      onDrop={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        onDrop(event);
      }}
      onDragOver={(event) => event.preventDefault()}
    >
      {hasGenerativeReferences ? (
        <TooltipProvider>
          <div className="drop-reference-grid" aria-label="Reference images">
            {references.map((reference, index) => (
              <div className="drop-reference-thumb" key={reference.id} title={reference.name}>
                <img src={reference.src} alt="" />
                <Badge className="drop-reference-index">{index + 1}</Badge>
                {onRemoveReference && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon-xs"
                        className="drop-reference-remove"
                        disabled={disabled}
                        onClick={(event) => {
                          event.stopPropagation();
                          onRemoveReference(reference.id);
                        }}
                        aria-label={`Remove ${reference.name}`}
                      >
                        <Trash2 className="app-icon" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Remove reference</TooltipContent>
                  </Tooltip>
                )}
              </div>
            ))}
          </div>
        </TooltipProvider>
      ) : imageSrc && !isGenerative ? (
        <img className="drop-preview" src={imageSrc} alt="" />
      ) : (
        <Image className="app-icon" />
      )}
      <strong>{isGenerative ? "Reference image(s)" : imageName || "Choose an image"}</strong>
      {isGenerative ? (
        <p>{references.length ? `${references.length}/4 selected` : "Drop up to 4 images here or browse from Explorer."}</p>
      ) : (
        !imagePath && !imageObjectUrl && <p>Drop an image here or browse from Explorer.</p>
      )}
      <PrimaryButton type="button" disabled={disabled} onClick={onChooseInputImage}>
        <FolderOpen className="app-icon" />
        {isGenerative ? "Browse image(s)" : "Browse Image"}
      </PrimaryButton>
    </section>
  );
}

export function ImageActionPanel({
  imageAction,
  onSetImageAction,
  disabled,
}: {
  imageAction: string;
  onSetImageAction: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="panel">
      <h2>Action</h2>
      <SelectControl disabled={disabled} value={imageAction} onChange={onSetImageAction} options={[
        { value: "dither", label: "Dither" },
        { value: "compress", label: "Compressor" },
        { value: "palette", label: "Palette Extractor" },
        { value: "flux2", label: "Flux.2 Generate" },
        { value: "vosr", label: "VOSR 2.0 Upscale" },
      ]} />
    </div>
  );
}
