import { useVideoEffects } from "./use-video-effects";
import { useSubtitleFonts } from "./use-subtitle-fonts";
import { useCaptionExport } from "./use-caption-export";
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { exportAss, exportSubtitles, validProject, type SubtitleCue, type SubtitleGroupingOptions, type TranscriptProject } from "@/lib/subtitles";

import { regroupSubtitles, canUndoGrouping, undoSubtitleGrouping, type GroupingUndo } from "@/lib/subtitle-grouping";

type Status = { installed: boolean; path: string; gpuAvailable: boolean;
  speakerModelReady: boolean; tokenConfigured: boolean; tokenPersistent: boolean; credentialError?: string;
};
type Context = { frame?: { width: number; height: number }; enabled: boolean; source: string; duration: number; start: number; end: number; currentTime: number; seek: (time: number) => void; blocked: boolean };
export type Transcription = ReturnType<typeof useTranscription>;

export function useTranscription(context: Context, appendLog: (message: string) => void) {
  const fontLibrary = useSubtitleFonts();
  const captionExport = useCaptionExport();
  const cancelActive = useRef<() => Promise<void>>(async () => {});
  cancelActive.current = async () => { if (captionExport.isRunning()) await captionExport.cancel(); else await invoke("cancel_transcription"); };
  const [device, setDevice] = useState("cpu");
  const [model, setModel] = useState("small");
  const [language, setLanguage] = useState("auto");
  const [setupLanguage, setSetupLanguage] = useState("en");
  const [selectionOnly, setSelectionOnly] = useState(false);
  const [speakerCount, setSpeakerCount] = useState("");
  const [status, setStatus] = useState<Status>();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [step, setStep] = useState("");
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [documents, setDocuments] = useState<Record<string, TranscriptProject>>({});
  const saved = useRef<Record<string, TranscriptProject>>({});
  const latest = useRef(documents); latest.current = documents;
  const saveQueue = useRef(Promise.resolve());
  const [tab, setTab] = useState<"log" | "subtitles">("log");
  const [captions, setCaptions] = useState(true);
  const [follow, setFollow] = useState(true);
  const project = documents[context.source];
  const [groupingPreview, setGroupingPreview] = useState<{ base: TranscriptProject; project: TranscriptProject; estimatedBlocks: number }>();
  const [groupingUndos, setGroupingUndos] = useState<Record<string, GroupingUndo>>({});
  const preview = groupingPreview?.base === project ? groupingPreview : undefined;
  const displayProject = preview?.project ?? project;
  const isGroupingPreview = !!preview;
  const videoEffects = useVideoEffects(context.source);
  const groupingUndo = groupingUndos[context.source];
  const canUndo = canUndoGrouping(project, groupingUndo);
  useEffect(() => { setGroupingPreview(undefined); }, [context.source]);
  const [speakerVisibility, setSpeakerVisibility] = useState<Record<string, boolean>>({});
  const speakersEnabled = speakerVisibility[context.source] ?? Object.keys(project?.speakers ?? {}).length > 0;
  function setSpeakersEnabled(enabled: boolean) {
    setSpeakerVisibility(previous => ({ ...previous, [context.source]: enabled }));
    if (enabled && project && !Object.keys(project.speakers).length) {
      updateProject(p => ({ ...p, speakers: { "speaker-1": "Speaker 1" } }));
    }
  }
  const activeCue = displayProject?.cues.find(c => context.currentTime >= c.start && context.currentTime < c.end);
  const statusRequest = useRef(0);
  const refresh = useCallback(async () => {
    if (!isTauri()) return;
    const request = ++statusRequest.current;
    try { const result = await invoke<Status>("transcription_status", { device }); if (request === statusRequest.current) setStatus(result); }
    catch (e) { if (request === statusRequest.current) setError(String(e)); }
  }, [device]);
  useEffect(() => { if (context.enabled || project) { setStatus(undefined); void refresh(); } }, [refresh, context.enabled, !!project]);
  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = listen<{ message: string }>("transcription-progress", ({ payload }) => {
      setStep(payload.message); appendLog(`WhisperX: ${payload.message}`);
    });
    return () => { void unlisten.then(f => f()).catch(() => {}); };
  }, [appendLog]);
  useEffect(() => {
    const source = context.source;
    if (!source || latest.current[source] || !isTauri()) return;
    let cancelled = false;
    void invoke<unknown>("load_transcript", { source }).then(value => {
      if (cancelled || !value) return;
      if (!validProject(value) || value.source !== source) throw new Error("Saved transcript is invalid.");
      saved.current[source] = value;
      setDocuments(prev => prev[source] ? prev : { ...prev, [source]: value });
      setTab("subtitles");
    }).catch(e => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [context.source]);

  const saveAll = useCallback(() => {
    const snapshot = latest.current;
    const task = saveQueue.current.catch(() => {}).then(async () => {
      setSaving(true);
      try {
      for (const [source, value] of Object.entries(snapshot)) {
        if (saved.current[source] === value || latest.current[source] !== value) continue;
        await invoke("save_transcript", { project: value });
        saved.current[source] = value;
      }
      setSaveError("");
      } finally { setSaving(false); }
    });
    const checked = task.catch(e => { setSaveError(String(e)); throw e; });
    saveQueue.current = checked;
    return checked;
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void saveAll().catch(e => setSaveError(String(e))); }, 600);
    return () => window.clearTimeout(timer);
  }, [documents, saveAll]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let closing = false;
    const subscription = getCurrentWindow().onCloseRequested(async event => {
      if (disposed || closing) return;
      const dirty = Object.entries(latest.current).some(([source, value]) => saved.current[source] !== value);
      if (!dirty && !busyRef.current) return;
      event.preventDefault();
      try {
        if (busyRef.current) {
          if (!await confirm("Cancel the current subtitle operation and close?", { title: "Subtitle operation is running", kind: "warning" })) return;
          await cancelActive.current();
          while (busyRef.current) await new Promise(resolve => window.setTimeout(resolve, 100));
        }
        await saveAll();
        closing = true;
        await getCurrentWindow().destroy();
      } catch (e) {
        setSaveError(`Could not save before closing: ${String(e)}`); setTab("subtitles");
        if (await confirm("Subtitles could not be saved. Close without saving the latest edits?", { title: "Unsaved subtitles", kind: "warning" })) {
          closing = true; await getCurrentWindow().destroy();
        }
      }
    });
    return () => { disposed = true; void subscription.then(f => f()).catch(() => {}); };
  }, [saveAll]);

  async function operation(task: () => Promise<void>, keepEditor = false) {
    if (busyRef.current || context.blocked) return;
    busyRef.current = true; setBusy(true); setError(""); setTab(keepEditor ? "subtitles" : "log");
    try { await task(); }
    catch (e) { setError(String(e)); appendLog(`${keepEditor ? "Video export" : "WhisperX"}: ${String(e)}`); }
    finally { busyRef.current = false; setBusy(false); await refresh(); }
  }
  async function setup() {
    await operation(async () => {
      setStep("Preparing transcription setup");
      await invoke("setup_transcription", { device, model, language: setupLanguage });
      setStep("Transcription ready");
    });
  }
  async function saveHuggingFaceToken(token: string, remember: boolean) {
    await invoke("set_transcription_token", { token, remember });
    await refresh();
  }
  async function clearHuggingFaceToken() {
    await invoke("clear_transcription_token");
    await refresh();
  }
  async function setupSpeakers() {
    await operation(async () => {
      setStep("Preparing speaker detection setup");
      await invoke("setup_speaker_detection", { device });
      setStep("Speaker detection ready");
    });
  }
  async function removeSpeakers() {
    if (!await confirm("Remove the shared speaker model setup? Subtitle projects and speaker names will be kept.", { title: "Remove speaker model", kind: "warning" })) return;
    await operation(async () => { await invoke("remove_speaker_detection"); setStep("Speaker model setup removed"); });
  }
  async function detectSpeakers() {
    if (isGroupingPreview) { setError("Apply or cancel the grouping preview first."); return; }
    if (!project || !project.cues.length || busyRef.current) return;
    const count = speakerCount.trim() ? Number(speakerCount) : null;
    if (count !== null && (!Number.isInteger(count) || count < 1 || count > 50)) { setError("Use automatic counting or enter 1–50 speakers."); return; }
    if (project.cues.some(cue => cue.speaker) && !await confirm("Replace the current speaker assignments? Subtitle text, timing and saved speaker names will be kept.", { title: "Detect speakers again", kind: "warning" })) return;
    const source = project.source;
    await operation(async () => {
      setStep("Preparing speaker detection");
      await saveAll();
      const result = await invoke<unknown>("detect_transcript_speakers", { device, project, speakerCount: count });
      if (!validProject(result) || result.source !== source) throw new Error("Speaker detection returned an invalid project.");
      saved.current[source] = result;
      setDocuments(previous => ({ ...previous, [source]: result }));
      setSpeakerVisibility(previous => ({ ...previous, [source]: true }));
      setTab("subtitles");
    });
  }
  async function run() {
    if (isGroupingPreview) { setError("Apply or cancel the grouping preview first."); return; }
    if (!context.source || context.duration <= 0 || busyRef.current) return;
    const source = context.source;
    if (project && !await confirm("Replace the subtitles for this media? Export a project copy first to keep the current version.", { title: "Transcribe again", kind: "warning" })) return;
    const start = selectionOnly ? context.start : 0;
    const end = selectionOnly ? context.end : context.duration;
    await operation(async () => {
      setStep("Preparing audio");
      await saveAll();
      const result = await invoke<unknown>("run_transcription", { options: { source, start, end, model, device, language } });
      if (!validProject(result) || result.source !== source) throw new Error("The transcription returned an invalid project.");
      saved.current[source] = result;
      setDocuments(prev => ({ ...prev, [source]: result }));
      setTab("subtitles");
    });
  }
  function updateProject(update: (p: TranscriptProject) => TranscriptProject) {
    if (busyRef.current || isGroupingPreview) return;
    const source = context.source;
    setDocuments(prev => prev[source] ? { ...prev, [source]: update(prev[source]) } : prev);
  }
  function updateCue(id: string, patch: Partial<SubtitleCue>) {
    updateProject(p => ({ ...p, cues: p.cues.map(c => c.id === id ? { ...c, ...patch } : c) }));
  }
  async function importProject() {
    if (isGroupingPreview) { setError("Apply or cancel the grouping preview first."); return; }
    try {
      const path = await open({ multiple: false, filters: [{ name: "Subtitle project", extensions: ["json"] }] });
      if (typeof path !== "string") return;
      const result = await invoke<unknown>("import_transcript", { path });
      if (!validProject(result)) throw new Error("Invalid subtitle project.");
      if (result.source !== context.source) throw new Error("Load this project's original media first, then open the subtitle project.");
      if (project && !await confirm("Replace the current subtitle project with this file?", { title: "Open subtitle project", kind: "warning" })) return;
      setDocuments(prev => ({ ...prev, [result.source]: result })); setTab("subtitles"); setError("");
    } catch (e) { setError(String(e)); }
  }
  async function exportProject(format: "srt" | "vtt" | "txt" | "ass" | "json", shiftToZero = false, includeSpeakers = false) {
    if (!project) return;
    if (isGroupingPreview) { setError("Apply or cancel the grouping preview before exporting."); return; }
    try {
      const name = context.source.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") || "subtitles";
      const path = await save({ defaultPath: `${name}.${format === "json" ? "subtitles.json" : format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
      if (!path) return;
      await invoke("export_transcript", { path, text: format === "json" ? JSON.stringify(project, null, 2) : format === "ass" ? exportAss(project, shiftToZero, includeSpeakers, context.frame) : exportSubtitles(project, format, shiftToZero, includeSpeakers) });
      setStep(`Saved ${format.toUpperCase()} file`); setError("");
    } catch (e) { setError(String(e)); }
  }
  async function exportVideo(sidecarFormat?: "srt" | "vtt" | "ass", includeSpeakers = false, includeCaptions = true, selection = false) {
    if (!context.frame || !context.duration || isGroupingPreview || busyRef.current || context.blocked) return;
    const renderProject: TranscriptProject = includeCaptions && project ? project : {version:1,source:context.source,language:"en",model:"",rangeStart:0,rangeEnd:context.duration,cues:[],recognizedSegments:[],speakers:{}};
    const start = selection ? Math.max(0, context.start) : 0;
    const end = selection ? Math.min(context.duration, context.end) : context.duration;
    if (end <= start) { setError("Choose a nonempty video range."); return; }
    try {
      const name = context.source.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") || "video";
      const path = await save({ defaultPath: `${name}-${videoEffects.settings.enabled ? "effects" : "captioned"}.mp4`, filters: [{ name: "Captioned video", extensions: ["mp4"] }] });
      if (!path) return;
      const sidecar = sidecarFormat && project ? { extension: sidecarFormat, text: sidecarFormat === "ass" ? exportAss(project, false, includeSpeakers, context.frame) : exportSubtitles(project, sidecarFormat, false, includeSpeakers) } : undefined;
      if (sidecar && !await confirm(`Save the video and a matching .${sidecar.extension} subtitle file? An existing subtitle file with the same name will be replaced.`, { title: "Export video and subtitles" })) return;
      await operation(async () => {
        await captionExport.run(renderProject, context.frame!, context.duration, path, fontLibrary.ensureFont, sidecar, {effects:videoEffects.settings,start,end});
        setStep("MP4 saved"); appendLog(`Saved MP4: ${path}`);
      }, true);
    } catch (failure) { setError(String(failure)); }
  }
  function previewGrouping(options: SubtitleGroupingOptions) {
    if (!project || busyRef.current || context.blocked) return;
    try {
      const result = regroupSubtitles(project, options);
      if (!validProject(result.project)) throw new Error("The grouping preview contains invalid subtitle timing.");
      setGroupingPreview({ base: project, ...result }); setError(""); setTab("subtitles");
    } catch (failure) { setGroupingPreview(undefined); setError(String(failure)); }
  }
  function applyGrouping() {
    if (!preview || busyRef.current || context.blocked) return;
    const source = preview.base.source;
    if (latest.current[source] !== preview.base) {
      setGroupingPreview(undefined); setError("The subtitles changed. Preview the grouping again before applying it."); return;
    }
    setDocuments(previous => previous[source] === preview.base ? { ...previous, [source]: preview.project } : previous);
    setGroupingUndos(previous => ({ ...previous, [source]: { before: preview.base, applied: preview.project } }));
    setGroupingPreview(undefined); setError("");
  }
  function undoGrouping() {
    if (!project || !groupingUndo || busyRef.current || isGroupingPreview || context.blocked) return;
    try {
      const restored = undoSubtitleGrouping(project, groupingUndo);
      setDocuments(previous => previous[project.source] === project ? { ...previous, [project.source]: restored } : previous);
      setGroupingUndos(previous => { const next = { ...previous }; delete next[project.source]; return next; });
      setError(""); setTab("subtitles");
    } catch (failure) { setError(String(failure)); }
  }
  async function remove(models: boolean) {
    if (!await confirm(models ? "Remove this runtime and all shared transcription model downloads? Saved subtitle projects will be kept." : "Remove this transcription runtime? Model downloads and saved projects will be kept.", { title: "Remove transcription tools", kind: "warning" })) return;
    await operation(async () => { await invoke("remove_transcription", { device, models }); setStep("Transcription tools removed"); });
  }
  return { ...context, videoEffects, fontLibrary, captionExport, exportVideo, device, setDevice, model, setModel, language, setLanguage, setupLanguage, setSetupLanguage,
    speakerCount, setSpeakerCount, saveHuggingFaceToken, clearHuggingFaceToken, setupSpeakers, removeSpeakers, detectSpeakers,
    displayProject, isGroupingPreview, groupingPreview: preview, previewGrouping, applyGrouping,
    cancelGroupingPreview: () => setGroupingPreview(undefined), undoGrouping, canUndoGrouping: canUndo,
    groupingUndoBlocked: !!groupingUndo && !canUndo,
    selectionOnly, setSelectionOnly, status, busy, step, error, saveError, saving, project, activeCue,
    tab, setTab, captions, setCaptions, follow, setFollow, speakersEnabled, setSpeakersEnabled, setup, run, updateProject, updateCue,
    importProject, exportProject, remove, saveAll,
    cancel: async () => { try { await cancelActive.current(); setStep("Cancelling…"); } catch (e) { setError(String(e)); } },
  };
}
