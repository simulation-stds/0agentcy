import { formatColorValue, type ColorFormat, type PaletteSwatch } from "@/lib/palette";

export function PaletteSection({ title, colors, format }: { title: string; colors: PaletteSwatch[]; format: ColorFormat }) {
  return (
    <div className="palette-section">
      <h3>{title}</h3>
      <div className="swatch-grid">
        {colors.map((color) => (
          <div className="swatch-card" key={`${title}-${color.hex}`}>
            <span style={{ backgroundColor: color.hex }} />
            <code>{formatColorValue(color, format)}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
