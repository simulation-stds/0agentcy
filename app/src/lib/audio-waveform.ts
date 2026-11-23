export function createAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  return new AudioContextClass();
}

export async function decodeAudioBuffer(context: AudioContext, src: string, signal?: AbortSignal) {
  const response = await fetch(src, { signal });
  if (!response.ok) throw new Error(`Audio read failed (${response.status})`);
  return context.decodeAudioData(await response.arrayBuffer());
}

export async function buildWaveformPeaks(src: string) {
  const context = createAudioContext();
  try {
    return getWaveformPeaks(await decodeAudioBuffer(context, src));
  } finally {
    await context.close();
  }
}

export function getWaveformPeaks(audioBuffer: AudioBuffer) {
  const channelCount = Math.min(audioBuffer.numberOfChannels, 6);
  const bucketCount = 900;
  const channelPeaks: number[][] = [];
  for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
    const channel = audioBuffer.getChannelData(channelIndex);
    const bucketSize = Math.max(1, Math.floor(channel.length / bucketCount));
    const peaks: number[] = [];
    for (let bucket = 0; bucket < bucketCount; bucket += 1) {
      const start = bucket * bucketSize;
      const end = Math.min(channel.length, start + bucketSize);
      let peak = 0;
      for (let index = start; index < end; index += 1) {
        peak = Math.max(peak, Math.abs(channel[index]));
      }
      peaks.push(peak);
    }
    const max = Math.max(...peaks, 0.001);
    channelPeaks.push(peaks.map((peak) => peak / max));
  }
  return channelPeaks;
}

export function drawWaveform(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  peaks: number[][],
  separateChannels: boolean,
  visibleStart: number,
  visibleEnd: number,
  duration: number,
  color?: string,
) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#101312";
  context.fillRect(0, 0, width, height);

  if (!peaks.length) {
    context.fillStyle = "#5d6a62";
    context.font = "14px sans-serif";
    context.fillText("Waveform unavailable", 16, height / 2);
    return;
  }

  const channels = separateChannels ? peaks : [combinePeaks(peaks)];
  const visibleChannels = channels.map((channel) => sliceVisiblePeaks(channel, visibleStart, visibleEnd, duration));
  const gap = separateChannels && visibleChannels.length > 1 ? 8 : 0;
  const laneHeight = (height - gap * (visibleChannels.length - 1)) / visibleChannels.length;
  visibleChannels.forEach((channel, channelIndex) => {
    const top = channelIndex * (laneHeight + gap);
    const middle = top + laneHeight / 2;
    const barWidth = width / channel.length;
    context.fillStyle = color ?? (channelIndex % 2 === 0 ? "#a7f06b" : "#7fd7c5");
    for (let index = 0; index < channel.length; index += 1) {
      const peak = channel[index];
      const barHeight = Math.max(1, peak * laneHeight * 0.82);
      const x = index * barWidth;
      context.fillRect(x, middle - barHeight / 2, Math.max(1, barWidth * 0.72), barHeight);
    }
    if (separateChannels && channels.length > 1) {
      context.fillStyle = "#5d6a62";
      context.font = "12px sans-serif";
      context.fillText(`Ch ${channelIndex + 1}`, 10, top + 18);
    }
  });
}

function sliceVisiblePeaks(channel: number[], visibleStart: number, visibleEnd: number, duration: number) {
  if (!duration || (visibleStart <= 0 && visibleEnd >= duration)) return channel;
  const startIndex = Math.max(0, Math.floor((visibleStart / duration) * channel.length));
  const endIndex = Math.min(channel.length, Math.ceil((visibleEnd / duration) * channel.length));
  return channel.slice(startIndex, Math.max(startIndex + 1, endIndex));
}

function combinePeaks(peaks: number[][]) {
  const length = Math.max(...peaks.map((channel) => channel.length), 0);
  const combined: number[] = [];
  for (let index = 0; index < length; index += 1) {
    let value = 0;
    for (const channel of peaks) {
      value = Math.max(value, channel[index] ?? 0);
    }
    combined.push(value);
  }
  return combined;
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
