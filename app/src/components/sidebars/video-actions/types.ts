import type { SelectOption } from "@/components/app-controls";

export type VideoMetadata = {
  fps: number;
  width: number;
  height: number;
  codec: string;
};

export type RealEsrganModel = {
  name: string;
  scale: string;
};

export type RifeModel = {
  name: string;
};

export type RealEsrganDevice = {
  id: string;
  name: string;
};

export type FaceFusionStatus = {
  message: string;
};

export type { SelectOption };
