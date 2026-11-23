export type SkinDetectionMode = "fast" | "detail";

export type SkinCrop = [left: number, top: number, right: number, bottom: number];

export type DetectedSkinMask = {
  dataUrl: string;
  bounds: SkinCrop;
};

export type SkinPoint = [number, number];

export type SkinStroke = {
  width: number;
  erase: boolean;
  points: SkinPoint[];
};
