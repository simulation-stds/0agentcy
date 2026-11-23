import { FormRow, HelpIcon, PrimaryButton, RangeControl, SecondaryButton, SelectControl } from "@/components/app-controls";
import { Input } from "@/components/ui/input";
import type { useImageTools } from "@/hooks/use-image-tools";
import type { VosrDevice } from "@/hooks/use-tool-state";
import { vosrDeviceOptions } from "@/lib/vosr-devices";

export function VosrControls({ tools, ready, setupMessage, installing, devices }: {
  tools: ReturnType<typeof useImageTools>;
  ready: boolean;
  setupMessage?: string;
  installing: boolean;
  devices: VosrDevice[];
}) {
  const busy = tools.isRunningVosr || tools.isEnhancingVosr || tools.isDetectingSkin;
  const actionsDisabled = busy || tools.isSavingVosrBlend;
  const hasVosrResult = Boolean(tools.vosrOutputPath);
  const detailBlend = tools.vosrCompareDetail && Boolean(tools.vosrDetailPath);
  const strength = detailBlend ? tools.skinStrength : tools.vosrStrength;
  const setStrength = detailBlend ? tools.setSkinStrength : tools.setVosrStrength;
  return (
    <section className="panel">
      <h2>VOSR 2.0</h2>
      {!ready && <p role="status">{installing ? "VOSR setup is running." : setupMessage || "Checking VOSR installation… Install it in Settings → Image → Editing."}</p>}
      {tools.isAnimatedGif && <p>Choose a still image to use VOSR.</p>}
      <PrimaryButton disabled={!ready || installing || !tools.imagePath || tools.isAnimatedGif || actionsDisabled}
        onClick={tools.runVosr}>{tools.isRunningVosr ? "Upscaling…" : "Upscale image"}</PrimaryButton>
      {busy && <SecondaryButton onClick={tools.cancelVosr}>Cancel</SecondaryButton>}
      <SecondaryButton type="button" disabled={actionsDisabled}
        onClick={tools.openVosrResult}>Open VOSR result</SecondaryButton>
      <section className="grid gap-2 border-t border-border pt-2" aria-labelledby="skin-enhance-heading">
        <h3 id="skin-enhance-heading" className="setting-label text-sm font-semibold">
          Skin Enhance
          <HelpIcon text="Adds fine brightness detail inside a skin mask you can detect and refine at the current image size." />
        </h3>
        {!hasVosrResult && <p className="text-sm">Upscale an image or open a saved VOSR result to enhance skin.</p>}
        <SecondaryButton type="button" disabled={!hasVosrResult || actionsDisabled || tools.skinMaskEditing}
          onClick={() => tools.setSkinMaskEditing(true)}>
          {tools.skinMaskEditing ? "Editing skin mask" : "Edit skin mask"}
        </SecondaryButton>
        <SecondaryButton type="button" disabled={!hasVosrResult || actionsDisabled} onClick={tools.openSkinResult}>
          Open skin result
        </SecondaryButton>
      </section>
      {!tools.skinMaskEditing && tools.vosrDetailPath && tools.vosrBlendSource && (
        <FormRow label="Preview">
          <SelectControl value={tools.vosrCompareDetail ? "detail" : "blend"}
            options={[{ value: "detail", label: "VOSR vs. enhanced skin" }, { value: "blend", label: "Original vs. VOSR blend" }]}
            onChange={value => tools.setVosrCompareDetail(value === "detail")} />
        </FormRow>
      )}
      {!tools.skinMaskEditing && (detailBlend || tools.vosrBlendSource) && (
        <>
          <RangeControl label={detailBlend ? "Skin strength" : "VOSR strength"}
            help={detailBlend ? "0% shows the VOSR result and 100% shows full skin enhancement." : "0% shows the original and 100% shows the full VOSR result."}
            min={0} max={100} step={1} value={strength} displayValue={`${strength}%`}
            onChange={value => setStrength(Number(value))} />
          <SecondaryButton type="button" disabled={actionsDisabled}
            onClick={() => tools.saveVosrBlend(detailBlend ? "skin" : "vosr")}>
            {tools.isSavingVosrBlend ? "Saving blend…" : "Save blend"}
          </SecondaryButton>
        </>
      )}
      <p role="status" className="file-path-text">{tools.vosrStatus}</p>
      <fieldset className="border-t border-border pt-2" disabled={busy}>
        <FormRow label="Upscale" help="Enlarge the photo, or restore it at its original size.">
          <SelectControl value={tools.vosrUpscale} onChange={tools.setVosrUpscale}
            options={[{ value: "1", label: "1× Restore" }, { value: "2", label: "2×" }, { value: "4", label: "4×" }]} />
        </FormRow>
        <FormRow label="Memory use" help="Smaller tiles reduce memory use and can take longer.">
          <SelectControl value={tools.vosrTileSize} onChange={tools.setVosrTileSize}
            options={[{ value: "512", label: "Standard" }, { value: "256", label: "Lower memory" }]} />
        </FormRow>
        <FormRow label="Device" help="Choose the NVIDIA GPU used for upscaling.">
          <SelectControl value={tools.vosrDevice} onChange={tools.setVosrDevice}
            options={vosrDeviceOptions(devices)} />
        </FormRow>
        <FormRow label="Seed" help="Use the same seed to repeat a result with the same settings.">
          <Input value={tools.vosrSeed} inputMode="numeric" onChange={event => tools.setVosrSeed(event.currentTarget.value)} />
        </FormRow>
        <details className="vosr-advanced">
          <summary>Advanced</summary>
          <FormRow label="Attention backend" help="Choose how the vision encoder runs. Unsupported xFormers operations fall back to PyTorch.">
            <SelectControl value={tools.vosrBackend} onChange={tools.setVosrBackend}
              options={[{ value: "auto", label: "Auto" }, { value: "pytorch", label: "PyTorch" }, { value: "xformers", label: "xFormers (with fallback)" }]} />
          </FormRow>
          <FormRow label="Color correction" help="Match the restored image's colors to the original.">
            <SelectControl value={tools.vosrColorCorrection} onChange={tools.setVosrColorCorrection}
              options={[{ value: "wavelet", label: "Wavelet (default)" }, { value: "adain", label: "Match color statistics" }, { value: "nofix", label: "None" }]} />
          </FormRow>
          <FormRow label="Restoration tile overlap" help="Overlap in pixels, with a minimum of one eighth of each tile. Larger overlaps can take longer.">
            <SelectControl value={tools.vosrTileOverlap} onChange={tools.setVosrTileOverlap}
              options={[0, 32, 64, 128].map(value => ({ value: String(value), label: value === 0 ? "Minimum (automatic)" : `${value} px${value === 64 ? " (default)" : ""}` }))} />
          </FormRow>
          <FormRow label="VAE processing" help="Larger tiles use more GPU memory. Full image uses much more memory and may fail on larger photos.">
            <SelectControl value={tools.vosrVaeTileSize} onChange={tools.setVosrVaeTileSize}
              options={[{ value: "512", label: "Tiled · 512 px" }, { value: "1024", label: "Tiled · 1024 px (default)" }, { value: "2048", label: "Tiled · 2048 px" }, { value: "0", label: "Full image (high memory)" }]} />
          </FormRow>
          {tools.vosrVaeTileSize !== "0" && <FormRow label="VAE tile overlap" help="Overlap in pixels for image encoding and decoding.">
            <SelectControl value={tools.vosrVaeTileOverlap} onChange={tools.setVosrVaeTileOverlap}
              options={[0, 64, 128, 256].map(value => ({ value: String(value), label: value === 0 ? "Follow restoration overlap" : `${value} px${value === 128 ? " (default)" : ""}` }))} />
          </FormRow>}
          <SecondaryButton type="button" onClick={() => {
            tools.setVosrBackend("auto"); tools.setVosrColorCorrection("wavelet");
            tools.setVosrTileOverlap("64"); tools.setVosrVaeTileSize("1024"); tools.setVosrVaeTileOverlap("128");
          }}>Reset advanced settings</SecondaryButton>
        </details>
      </fieldset>
    </section>
  );
}
