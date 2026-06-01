import type { SelectOption } from "@/components/app-controls";

export type ModelDevice = {
  id: string;
  name: string;
};

const fallbackGpuIds = ["0", "1"];

export function resolveModelDevice(selectedDevice: string, preferredModelDevice: string) {
  return selectedDevice === "favorite" ? preferredModelDevice.trim() : selectedDevice;
}

export function defaultModelDevice(preferredModelDevice: string) {
  return preferredModelDevice.trim() ? "favorite" : "";
}

export function modelDeviceOptions(devices: ModelDevice[], preferredModelDevice: string, includeCpu = false): SelectOption[] {
  const detectedIds = new Set(devices.map((device) => device.id));
  const favoriteLabel = preferredModelDevice.trim()
    ? `Favourite - GPU ${preferredModelDevice.trim()}`
    : "Favourite - Auto";
  const options: SelectOption[] = [
    { value: "", label: "Auto" },
    { value: "favorite", label: favoriteLabel },
  ];

  if (includeCpu) {
    options.push({ value: "-1", label: "CPU" });
  }

  options.push(
    ...devices.map((device) => ({
      value: device.id,
      label: `GPU ${device.id} - ${device.name}`,
    })),
  );

  options.push(
    ...fallbackGpuIds
      .filter((id) => !detectedIds.has(id))
      .map((id) => ({
        value: id,
        label: `GPU ${id}`,
      })),
  );

  return options;
}
