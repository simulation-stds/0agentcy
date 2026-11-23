import type { SubtitleCue, SubtitleGroupingOptions, TranscriptProject, TranscriptWord } from "./subtitles";

export const defaultGroupingOptions: SubtitleGroupingOptions = { maxWords: 5, maxLines: 2, breakOnPunctuation: true };

type Token = { text: string; before: string; start: number; end: number; speaker?: string; word?: TranscriptWord; estimated: boolean; source: number };
type TextToken = { text: string; before: string };

function textTokens(text: string, language: string): TextToken[] {
  const clean = text.trim();
  // Space-delimited words preserve contractions and punctuation. For languages
  // normally written without spaces, use the webview's word segmenter when present.
  type SegmenterType = new (locale: string, options: { granularity: string }) => { segment: (value: string) => Iterable<{ segment: string; isWordLike?: boolean }> };
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterType }).Segmenter;
  if (/^(ja|zh|th)(-|$)/.test(language) && Segmenter) {
    const result: TextToken[] = [];
    let pending = "";
    for (const part of new Segmenter(language, { granularity: "word" }).segment(clean)) {
      if (part.isWordLike) {
        result.push({ text: pending.trim() ? pending + part.segment : part.segment, before: pending.trim() ? "" : pending.replace(/\s+/gu, " ") });
        pending = "";
      } else if (part.segment.trim() && result.length) {
        result[result.length - 1].text += pending + part.segment;
        pending = "";
      } else { pending += part.segment; }
    }
    if (pending.trim() && result.length) result[result.length - 1].text += pending;
    if (result.length) return result;
  }
  return (clean.match(/\S+/gu) ?? []).map((word, index) => ({ text: word, before: index ? " " : "" }));
}

function linesFor(tokens: TextToken[]): string[] {
  const lines: string[] = [];
  let current = "";
  for (const token of tokens) {
    const joined = current + (current ? token.before : "") + token.text;
    if (current && joined.length > 42) { lines.push(current); current = token.text; }
    else { current = joined; }
  }
  if (current) lines.push(current);
  return lines;
}

function cueTokens(cue: SubtitleCue, source: number, language: string): Token[] {
  const text = textTokens(cue.text, language);
  const words = cue.words ?? [];
  const matches = !cue.timingEstimated && !cue.wordTimingEstimated && text.length === words.length && text.every((token, index) => token.text === words[index].word.trim());
  const aligned = matches && words.every((word, index) =>
    Number.isFinite(word.start) && Number.isFinite(word.end) && word.end! > word.start! &&
    word.start! >= cue.start - 0.001 && word.end! <= cue.end + 0.001 &&
    (!index || word.start! >= words[index - 1].end!));
  return text.map((token, index) => ({
    ...token,
    start: aligned && index ? words[index].start! : cue.start + (aligned ? 0 : index / text.length * (cue.end - cue.start)),
    end: aligned && index < text.length - 1 ? words[index].end! : aligned ? cue.end : cue.start + (index + 1) / text.length * (cue.end - cue.start),
    speaker: cue.speaker,
    word: matches ? { ...words[index] } : undefined,
    estimated: !aligned,
    source,
  }));
}

export function regroupSubtitles(project: TranscriptProject, options: SubtitleGroupingOptions) {
  if (!Number.isInteger(options.maxWords) || options.maxWords < 1 || options.maxWords > 50 ||
      ![1, 2].includes(options.maxLines) || typeof options.breakOnPunctuation !== "boolean") {
    throw new Error("Choose 1–50 words per block and one or two lines.");
  }
  const cues: SubtitleCue[] = [];
  const estimatedSources = new Set<number>();
  let group: Token[] = [];
  const flush = () => {
    if (!group.length) return;
    const start = Math.round(group[0].start * 1000) / 1000;
    const end = Math.round(group[group.length - 1].end * 1000) / 1000;
    if (end <= start) throw new Error("A block is too short to split at millisecond precision. Increase the word limit or extend its timing first.");
    const estimated = group.some(token => token.estimated);
    if (estimated) group.forEach(token => { if (token.estimated) estimatedSources.add(token.source); });
    cues.push({
      id: `group-${cues.length + 1}`, start, end, text: linesFor(group).join("\n"),
      ...(group[0].speaker ? { speaker: group[0].speaker } : {}),
      // Never attach stale recognized words to corrected dialogue. Original word
      // data is retained in groupingSourceCues, not presented as a fresh alignment.
      ...(group.every(token => token.word) ? { words: group.map(token => ({ ...token.word! })) } : {}),
      ...(estimated ? { timingEstimated: true } : {}),
    });
    group = [];
  };
  for (const [source, cue] of project.cues.entries()) {
    const tokens = cueTokens(cue, source, project.language);
    if (!tokens.length) {
      flush();
      cues.push({ ...cue, id: `group-${cues.length + 1}`, words: cue.words?.map(word => ({ ...word })) });
      continue;
    }
    // Preserve original cue order and never merge overlapping cues, long pauses,
    // or different speaker assignments into one caption.
    const previous = group[group.length - 1];
    if (previous && (tokens[0].start < previous.end || tokens[0].start - previous.end > 1)) flush();
    if (group.length) {
      const joinedWithoutSpaces = /^(ja|zh|th)(-|$)/.test(project.language);
      const latinBoundary = /[A-Za-z0-9]$/.test(group[group.length - 1].text) || /^[A-Za-z0-9]/.test(tokens[0].text);
      tokens[0].before = !joinedWithoutSpaces || latinBoundary ? " " : "";
    }
    for (const token of tokens) {
      const previousToken = group[group.length - 1];
      if (group.length && (group.length >= options.maxWords || token.speaker !== group[0].speaker ||
          token.start < previousToken.end || token.start - previousToken.end > 1 ||
          token.end - group[0].start > 6 || linesFor([...group, token]).length > options.maxLines)) flush();
      group.push(token);
      if (options.breakOnPunctuation && /[.!?。！？]["'»”’)\]]*$/u.test(token.text)) flush();
    }
  }
  flush();
  return {
    project: { ...project, cues, subtitleGrouping: { ...options }, groupingSourceCues: project.groupingSourceCues ?? project.cues },
    estimatedBlocks: estimatedSources.size,
  };
}

export type GroupingUndo = { before: TranscriptProject; applied: TranscriptProject };
export function canUndoGrouping(project: TranscriptProject | undefined, undo: GroupingUndo | undefined) {
  return !!project && !!undo && project.source === undo.applied.source && project.cues === undo.applied.cues;
}
export function undoSubtitleGrouping(project: TranscriptProject, undo: GroupingUndo): TranscriptProject {
  if (!canUndoGrouping(project, undo)) throw new Error("Subtitles changed after grouping. Undo was stopped to protect those edits.");
  return { ...project, cues: undo.before.cues, subtitleGrouping: undo.before.subtitleGrouping, groupingSourceCues: undo.before.groupingSourceCues };
}
