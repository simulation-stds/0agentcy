export type UpdateAvailability = {
  ffmpeg: boolean;
  miniforge: boolean;
  realesrgan: boolean;
  rife: boolean;
  facefusion: boolean;
  supir: boolean;
  supirXformers: boolean;
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
    imagemagick: false,
    oxipng: false,
    libavif: false,
    libwebp: false,
    mozjpeg: false,
  };
}
