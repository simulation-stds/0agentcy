import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Check, Download, LoaderCircle } from 'lucide-react';
import type { Transcription } from '@/hooks/use-transcription';
import type { CatalogueFont } from '@/hooks/use-subtitle-fonts';
import { useFontPreviews } from '@/hooks/use-font-previews';
import { FormRow, IconButton, SecondaryButton, SelectControl } from '@/components/app-controls';
import { Input } from '@/components/ui/input';

function FontResult({ font, sample, previews, observe, installed, installing, disabled, onInstall }: {
  font: CatalogueFont; sample: string; previews: ReturnType<typeof useFontPreviews>['previews'];
  observe: ReturnType<typeof useFontPreviews>['observe']; installed: boolean; installing: boolean; disabled: boolean; onInstall: () => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!row.current) return;
    const observer = new IntersectionObserver(entries => observe(font.id, entries[0].isIntersecting), {
      root: row.current.closest('[data-radix-scroll-area-viewport]'), rootMargin: '160px 0px',
    });
    observer.observe(row.current);
    return () => { observer.disconnect(); observe(font.id, false); };
  }, [font.id, observe]);
  const preview = previews[font.id];
  return <div ref={row} className="subtitle-font-result" data-font-id={font.id}>
    <div className="subtitle-font-sample"><strong>{font.family}</strong><small>{font.category}</small>
      <p style={{ fontFamily: preview?.alias ? `"${preview.alias}"` : undefined }}>{sample}</p>
      {!preview?.alias && <small role="status">{preview?.error ? 'Preview unavailable · scroll back to retry' : preview?.loading ? 'Loading preview…' : 'Preview loads as you scroll'}</small>}
    </div>
    <IconButton type="button" disabled={disabled || installed || installing} aria-label={installed ? `${font.family} installed` : `Download and install ${font.family}`} title={installed ? 'Installed' : 'Download and install font'} onClick={onInstall}>
      {installing ? <LoaderCircle className="app-icon animate-spin" /> : installed ? <Check className="app-icon" /> : <Download className="app-icon" />}
    </IconButton>
  </div>;
}

export function SubtitleFontSettings({ tools: t }: { tools: Transcription }) {
  const f = t.fontLibrary;
  const [catalog, setCatalog] = useState<CatalogueFont[]>([]), [query, setQuery] = useState(''), [category, setCategory] = useState('all');
  const [error, setError] = useState(''), [loading, setLoading] = useState(false), [family, setFamily] = useState('');
  const [installing, setInstalling] = useState(''), [limit, setLimit] = useState(40);
  const { previews, observe } = useFontPreviews();
  const more = useRef<HTMLDivElement>(null);
  const browse = useCallback(async (refresh = false) => {
    setLoading(true); setError('');
    try { setCatalog(await invoke('fontsource_catalog', { refresh })); }
    catch (e) { setError(String(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void browse(); }, [browse]);
  useEffect(() => setLimit(40), [query, category]);
  const categories = useMemo(() => [...new Set(catalog.map(font => font.category).filter(Boolean))].sort(), [catalog]);
  const filtered = useMemo(() => catalog.filter(font => font.family.toLowerCase().includes(query.toLowerCase()) && (category === 'all' || font.category === category)), [catalog, query, category]);
  useEffect(() => {
    if (!more.current || limit >= filtered.length) return;
    const observer = new IntersectionObserver(entries => { if (entries[0].isIntersecting) setLimit(n => n + 40); }, { root: more.current.closest('[data-radix-scroll-area-viewport]'), rootMargin: '200px 0px' });
    observer.observe(more.current); return () => observer.disconnect();
  }, [limit, filtered.length]);
  async function install(id: string) { setInstalling(id); try { await f.install(id); } finally { setInstalling(''); } }
  const sample = t.project?.cues.find(c => c.text.trim())?.text || 'Make every word stand out';
  return <section className="subtitle-font-settings" aria-label="Subtitle fonts">
    <h2>Subtitle fonts</h2>
    <p>Downloaded and imported fonts are installed for your user account so other applications can use them. Previews load automatically without installing fonts.</p>
    <fieldset className="subtitle-font-fields" disabled={f.working || t.busy}>
      <h3>Downloaded and imported fonts</h3>
      {!f.fonts.length && <p>No fonts added yet. Built-in font choices remain available.</p>}
      {f.fonts.map(font => <div className="subtitle-font-card" key={font.id}>
        <strong>{font.family}</strong><p style={{ fontFamily: `"${font.family}"`, fontSize: 24 }}>{sample}</p>
        <small>{font.license} · {font.systemInstalled ? 'Installed for other applications' : 'Available in this app'}</small>
        <div className="subtitle-export">{!font.systemInstalled && <SecondaryButton onClick={() => void f.installSystem(font.id)}>Install for other applications</SecondaryButton>}
          <SecondaryButton onClick={() => void f.remove(font.id)}>Remove {font.family}</SecondaryButton></div>
      </div>)}
      <h3>Fontsource library</h3>
      <SecondaryButton disabled={loading} onClick={() => void browse(true)}>Refresh catalogue</SecondaryButton>
      <Input aria-label="Search Fontsource" placeholder="Search fonts…" value={query} onChange={e => setQuery(e.target.value)} />
      <FormRow label="Font category"><SelectControl value={category} onChange={setCategory} options={[{ value: 'all', label: 'All categories' }, ...categories.map(value => ({ value, label: value.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }))]} /></FormRow>
      {loading && <p role="status">Loading Fontsource catalogue…</p>}
      {!!catalog.length && <small>{filtered.length} fonts · previews load as you scroll</small>}
      {!loading && !!catalog.length && !filtered.length && <p>No fonts match this search and category.</p>}
      {filtered.slice(0, limit).map(font => <FontResult key={font.id} font={font} sample={sample} previews={previews} observe={observe}
        installed={f.fonts.some(local => local.id === font.id && local.systemInstalled)} installing={installing === font.id} disabled={f.working || t.busy}
        onInstall={() => void install(font.id)} />)}
      {limit < filtered.length && <div ref={more} className="subtitle-font-more"><SecondaryButton onClick={() => setLimit(n => n + 40)}>Show more fonts</SecondaryButton></div>}
      <SecondaryButton onClick={() => void openUrl('https://fontsource.org/')}>Visit Fontsource</SecondaryButton>
      <h3>Import a font</h3><FormRow label="Font family name"><Input aria-label="Imported font family name" placeholder="Use the font’s family name" value={family} onChange={e => setFamily(e.target.value)} /></FormRow>
      <SecondaryButton disabled={!family.trim()} onClick={() => void f.importFont(family)}>Import TTF / OTF</SecondaryButton>
      <small>Removal also uninstalls the copies managed by this app. Other applications may need reopening to see font changes.</small>
    </fieldset>
    {f.working && <p role="status">Installing / updating fonts…</p>}{(error || f.error) && <p className="transcription-error" role="alert">{error || f.error}</p>}
  </section>;
}
