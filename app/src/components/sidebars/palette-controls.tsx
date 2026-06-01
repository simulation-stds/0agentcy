import { FormRow, SelectControl, SwitchRow } from "@/components/app-controls";
import type { PaletteSettings } from "@/lib/app-options";
import type { ColorFormat } from "@/lib/palette";

export function PaletteControls({
  paletteSettings,
  onUpdatePaletteSettings,
}: {
  paletteSettings: PaletteSettings;
  onUpdatePaletteSettings: (patch: Partial<PaletteSettings>) => void;
}) {
  return (
    <div className="panel">
      <h2>Setup</h2>
      <div className="settings-grid">
        <FormRow label="Primary colors" help="Maximum number of dominant colors to extract from the image.">
          <SelectControl value={String(paletteSettings.primaryCount)} onChange={(value) => onUpdatePaletteSettings({ primaryCount: Number(value) })} options={[1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: String(value) }))} />
        </FormRow>
        <FormRow label="Secondary colors" help="Maximum number of accent colors with extra hue separation from the primary palette.">
          <SelectControl value={String(paletteSettings.secondaryCount)} onChange={(value) => onUpdatePaletteSettings({ secondaryCount: Number(value) })} options={[1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: String(value) }))} />
        </FormRow>
        <FormRow label="Tertiary colors" help="Maximum number of supporting colors selected after primary and secondary colors.">
          <SelectControl value={String(paletteSettings.tertiaryCount)} onChange={(value) => onUpdatePaletteSettings({ tertiaryCount: Number(value) })} options={[1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: String(value) }))} />
        </FormRow>
        <FormRow label="CSS format" help="Color syntax used when copying or downloading CSS variables.">
          <SelectControl value={paletteSettings.colorFormat} onChange={(value) => onUpdatePaletteSettings({ colorFormat: value as ColorFormat })} options={[
            { value: "hex", label: "HEX" },
            { value: "rgb", label: "RGB" },
            { value: "hsl", label: "HSL" },
          ]} />
        </FormRow>
        <SwitchRow
          checked={paletteSettings.showOpposites}
          onCheckedChange={(checked) => onUpdatePaletteSettings({ showOpposites: checked })}
          help="Replaces the displayed palette with complementary colors by rotating each selected hue 180 degrees."
        >
          Opposite spectrum
        </SwitchRow>
      </div>
    </div>
  );
}
