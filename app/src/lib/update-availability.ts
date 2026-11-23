export type UpdateAvailability = {
  ffmpeg: boolean;
  miniforge: boolean;
  realesrgan: boolean;
  rife: boolean;
  facefusion: boolean;
  supir: boolean;
  supirXformers: boolean;
  flux2: boolean;
  wan21: boolean;
  wan22: boolean;
  imagemagick: boolean;
  oxipng: boolean;
  libavif: boolean;
  libwebp: boolean;
  mozjpeg: boolean;
};

export function createEmptyUpdateAvailability(): UpdateAvailability {
  return {
    ffmpeg: false,
    miniforge: false,
    realesrgan: false,
    rife: false,
    facefusion: false,
    supir: false,
    supirXformers: false,
    flux2: false,
    wan21: false,
    wan22: false,
    imagemagick: false,
    oxipng: false,
    libavif: false,
    libwebp: false,
    mozjpeg: false,
  };
}
