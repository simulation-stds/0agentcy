import { useRef, useState, type PointerEvent, type WheelEvent } from "react";

type ComparePan = {
  x: number;
  y: number;
};

export function useModelCompareInteraction() {
  const compareViewRef = useRef<HTMLDivElement | null>(null);
  const [compareSplit, setCompareSplit] = useState(50);
  const [compareZoom, setCompareZoom] = useState(1);
  const [comparePan, setComparePan] = useState<ComparePan>({ x: 0, y: 0 });
  const [compareDragMode, setCompareDragMode] = useState<"split" | "pan" | null>(null);
  const [comparePanStart, setComparePanStart] = useState({ x: 0, y: 0, panX: 0, panY: 0 });

  const compareTransform = `translate(${comparePan.x}px, ${comparePan.y}px) scale(${compareZoom})`;

  function resetCompareInteraction() {
    setCompareSplit(50);
    setCompareZoom(1);
    setComparePan({ x: 0, y: 0 });
  }

  function setCompareSplitFromClient(clientX: number) {
    const bounds = compareViewRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const value = ((clientX - bounds.left) / bounds.width) * 100;
    setCompareSplit(Math.max(0, Math.min(100, value)));
  }

  function startCompareInteraction(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("button, select")) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const splitX = bounds.left + (bounds.width * compareSplit) / 100;
    const nearDivider = Math.abs(event.clientX - splitX) <= 28;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (!nearDivider) {
      setCompareDragMode("pan");
      setComparePanStart({
        x: event.clientX,
        y: event.clientY,
        panX: comparePan.x,
        panY: comparePan.y,
      });
      return;
    }

    setCompareDragMode("split");
    setCompareSplitFromClient(event.clientX);
  }

  function updateCompareInteraction(event: PointerEvent<HTMLDivElement>) {
    if (!compareDragMode) return;
    if (compareDragMode === "pan") {
      setComparePan({
        x: comparePanStart.panX + event.clientX - comparePanStart.x,
        y: comparePanStart.panY + event.clientY - comparePanStart.y,
      });
      return;
    }
    setCompareSplitFromClient(event.clientX);
  }

  function stopCompareInteraction(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setCompareDragMode(null);
  }

  function scrollCompare(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const bounds = compareViewRef.current?.getBoundingClientRect();
    const nextZoom = Math.max(1, Math.min(10, Number((compareZoom + (event.deltaY < 0 ? 0.2 : -0.2)).toFixed(2))));
    if (!bounds || nextZoom === compareZoom) return;

    const anchorX = event.clientX - bounds.left - bounds.width / 2;
    const anchorY = event.clientY - bounds.top - bounds.height / 2;
    const ratio = nextZoom / Math.max(0.001, compareZoom);
    setCompareZoom(nextZoom);
    setComparePan((value) => ({
      x: anchorX - ratio * (anchorX - value.x),
      y: anchorY - ratio * (anchorY - value.y),
    }));
  }

  return {
    compareViewRef,
    compareSplit,
    compareZoom,
    compareTransform,
    compareDragMode,
    setCompareSplit,
    setCompareZoom,
    setComparePan,
    resetCompareInteraction,
    startCompareInteraction,
    updateCompareInteraction,
    stopCompareInteraction,
    scrollCompare,
  };
}
