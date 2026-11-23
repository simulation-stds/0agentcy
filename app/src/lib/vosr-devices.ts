import type { VosrDevice } from "@/hooks/use-tool-state";

// CUDA identifiers belong to a separate device list from Vulkan preferences.
export function vosrDeviceOptions(devices: VosrDevice[]) {
  return [{ value: "", label: "Auto" }, ...devices.map(device => ({
    value: device.id, label: device.name,
  }))];
}
