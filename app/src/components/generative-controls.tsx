import { FormRow, PrimaryButton, SecondaryButton } from "@/components/app-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aspectRatiosForOrientation, type GenerativeAspectOrientation } from "@/lib/generative-sizing";
import { ArrowUp, Crop, RectangleHorizontal, RectangleVertical, Square } from "lucide-react";

export type GenerativeReferenceItem = {
  id: string;
  path: string;
  name: string;
  src: string;
};

type GenerativeSizeControlsProps = {
  orientation: GenerativeAspectOrientation;
  aspectRatio: string;
  width: string;
  height: string;
  onSetOrientation: (value: GenerativeAspectOrientation) => void;
  onSetAspectRatio: (value: string) => void;
  onSetWidth: (value: string) => void;
};

export function GenerativeSizeControls({
  orientation,
  aspectRatio,
  width,
  height,
  onSetOrientation,
  onSetAspectRatio,
  onSetWidth,
}: GenerativeSizeControlsProps) {
  const ratios = aspectRatiosForOrientation(orientation);

  function updateOrientation(next: GenerativeAspectOrientation) {
    onSetOrientation(next);
    const nextRatios = aspectRatiosForOrientation(next);
    if (!nextRatios.some((ratio) => ratio.value === aspectRatio)) {
      onSetAspectRatio(nextRatios[0]?.value || "1:1");
    }
  }

  return (
    <div className="settings-grid">
      <div className="dither-mode-switch" role="radiogroup" aria-label="Image direction">
        <Button type="button" className={orientation === "horizontal" ? "active" : ""} onClick={() => updateOrientation("horizontal")} aria-pressed={orientation === "horizontal"}>
          <RectangleHorizontal className="app-icon" />
          Horizontal
        </Button>
        <Button type="button" className={orientation === "vertical" ? "active" : ""} onClick={() => updateOrientation("vertical")} aria-pressed={orientation === "vertical"}>
          <RectangleVertical className="app-icon" />
          Vertical
        </Button>
      </div>

      <FormRow label="Aspect ratio" help="Choose the image shape. Square is available in both directions.">
        <div className="ratio-options generative-ratio-options" role="radiogroup" aria-label="Aspect ratio">
          {ratios.map((item) => (
            <Button
              key={item.value}
              type="button"
              className={aspectRatio === item.value ? "active" : ""}
              onClick={() => onSetAspectRatio(item.value)}
              aria-label={item.label}
              aria-pressed={aspectRatio === item.value}
            >
              <Crop className="app-icon" />
              {item.label}
            </Button>
          ))}
        </div>
      </FormRow>

      <FormRow label="Width" help="Output width in pixels. Height updates automatically from the selected shape.">
        <Input type="number" min="256" max="2048" step="16" value={width} onChange={(event) => onSetWidth(event.currentTarget.value)} />
      </FormRow>
      <p className="settings-note">Height auto: {height}px</p>
    </div>
  );
}

type GenerativePromptBoxProps = {
  prompt: string;
  placeholder?: string;
  submitTitle?: string;
  isRunning: boolean;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export function GenerativePromptBox({
  prompt,
  placeholder = "Describe the image you want to create...",
  submitTitle = "Generate image",
  isRunning,
  onPromptChange,
  onSubmit,
  onCancel,
}: GenerativePromptBoxProps) {
  return (
    <form
      className="generative-prompt-box"
      onSubmit={(event) => {
        event.preventDefault();
        if (isRunning) {
          onCancel();
        } else {
          onSubmit();
        }
      }}
    >
      <textarea
        value={prompt}
        placeholder={placeholder}
        onChange={(event) => onPromptChange(event.currentTarget.value)}
        rows={3}
        disabled={isRunning} />
      <div className="generative-prompt-actions">
        <span>{isRunning ? "Generating" : "Ready"}</span>
        {isRunning ? (
          <SecondaryButton type="submit" className="generative-send-button" title="Cancel generation">
            <Square className="app-icon" />
          </SecondaryButton>
        ) : (
          <PrimaryButton type="submit" className="generative-send-button" disabled={!prompt.trim()} title={submitTitle}>
            <ArrowUp className="app-icon" />
          </PrimaryButton>
        )}
      </div>
    </form>
  );
}
