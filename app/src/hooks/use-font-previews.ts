import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

type Preview = { alias?: string; loading?: boolean; error?: string };
// Limit concurrent requests and keep only a small set of loaded font faces.
export function useFontPreviews() {
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const state = useRef({ disposed: false, active: new Set<string>(), pending: new Set<string>(), queue: [] as string[], running: 0, faces: new Map<string, FontFace>() });
  const pump = useCallback(function pumpQueue() {
    const s = state.current;
    while (!s.disposed && s.running < 3 && s.queue.length) {
      const id = s.queue.shift()!;
      if (!s.active.has(id)) { s.pending.delete(id); continue; }
      s.running++;
      setPreviews(previous => ({ ...previous, [id]: { loading: true } }));
      void (async () => {
        try {
          const result = await invoke<{ family: string; weight: string; encoded: string }>('preview_subtitle_font', { id });
          const alias = `FontsourcePreview-${id}`;
          const face = await new FontFace(alias, `url(data:font/woff2;base64,${result.encoded})`, { weight: result.weight }).load();
          if (s.disposed) return;
          document.fonts.add(face); s.faces.set(id, face);
          setPreviews(previous => ({ ...previous, [id]: { alias } }));
          for (const [oldId, oldFace] of s.faces) {
            if (s.faces.size <= 96) break;
            if (s.active.has(oldId)) continue;
            document.fonts.delete(oldFace); s.faces.delete(oldId);
            setPreviews(previous => { const next = { ...previous }; delete next[oldId]; return next; });
          }
        } catch (error) {
          if (!s.disposed) setPreviews(previous => ({ ...previous, [id]: { error: String(error) } }));
        } finally { s.running--; s.pending.delete(id); pumpQueue(); }
      })();
    }
  }, []);
  useEffect(() => {
    const s = state.current; s.disposed = false;
    return () => { s.disposed = true; s.active.clear(); s.queue.forEach(id => s.pending.delete(id)); s.queue = []; s.faces.forEach(face => document.fonts.delete(face)); s.faces.clear(); };
  }, []);
  const observe = useCallback((id: string, visible: boolean) => {
    const s = state.current;
    if (!visible) { s.active.delete(id); return; }
    s.active.add(id);
    if (s.faces.has(id)) { const face = s.faces.get(id)!; s.faces.delete(id); s.faces.set(id, face); return; }
    if (!s.pending.has(id)) { s.pending.add(id); s.queue.push(id); pump(); }
  }, [pump]);
  return { previews, observe };
}
