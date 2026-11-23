export type GenerativeAspectOrientation = "horizontal" | "vertical";

export type GenerativeAspectRatio = {
  value: string;
  label: string;
  width: number;
  height: number;
  orientations: GenerativeAspectOrientation[];
};

export const generativeAspectRatios: GenerativeAspectRatio[] = [
  { value: "1:1", label: "1:1", width: 1, height: 1, orientations: ["horizontal", "vertical"] },
  { value: "4:3", label: "4:3", width: 4, height: 3, orientations: ["horizontal"] },
  { value: "16:9", label: "16:9", width: 16, height: 9, orientations: ["horizontal"] },
  { value: "3:2", label: "3:2", width: 3, height: 2, orientations: ["horizontal"] },
  { value: "5:4", label: "5:4", width: 5, height: 4, orientations: ["horizontal"] },
  { value: "21:9", label: "21:9", width: 21, height: 9, orientations: ["horizontal"] },
  { value: "3:4", label: "3:4", width: 3, height: 4, orientations: ["vertical"] },
  { value: "9:16", label: "9:16", width: 9, height: 16, orientations: ["vertical"] },
  { value: "2:3", label: "2:3", width: 2, height: 3, orientations: ["vertical"] },
  { value: "4:5", label: "4:5", width: 4, height: 5, orientations: ["vertical"] },
  { value: "9:21", label: "9:21", width: 9, height: 21, orientations: ["vertical"] },
];

export function aspectRatiosForOrientation(orientation: GenerativeAspectOrientation) {
  return generativeAspectRatios.filter((ratio) => ratio.orientations.includes(orientation));
}

export function computeGenerativeHeight(width: string | number, aspectRatio: string) {
  const numericWidth = Math.max(16, Math.round(Number(width) || 1024));
  const ratio = generativeAspectRatios.find((item) => item.value === aspectRatio) || generativeAspectRatios[0];
  return Math.max(16, roundToMultipleOf16((numericWidth * ratio.height) / ratio.width));
}

function roundToMultipleOf16(value: number) {
  return Math.max(16, Math.round(value / 16) * 16);
}
