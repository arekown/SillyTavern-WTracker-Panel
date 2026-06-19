import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { EventNames } from 'sillytavern-utils-lib/types';
import { AutoModeOptions } from 'sillytavern-utils-lib/types/translate';
import { Generator, Message } from 'sillytavern-utils-lib';
import { EXTENSION_KEY } from '../config.js';
import { settingsManager } from './Settings.js';

const VALUE_KEY = 'value';
const IMG_KEY = 'WTrackerPanelImages';
const PLOT_KEY = 'mainPlot';
const PLOT_PROMPT_KEY = 'WTRACKER_MAINPLOT';

const plotGenerator = new Generator();

// ---------------------------------------------------------------- Hauptplot-Prompt
const MAIN_PLOT_PROMPT = `You are a master game master. Based ONLY on the provided source material (player character, main character, lorebook / world info, and current scene state), invent 10 candidate MAIN-PLOT goals for a long-running roleplay campaign. The user will pick the ones they like, so make every single one strong and usable on its own.

REQUIREMENTS:
- Each goal must be a MAJOR, long-horizon objective that takes a VERY long time to achieve — not resolvable in a few scenes. Think arcs spanning the whole campaign.
- Ground every goal concretely in the given world: use its factions, places, characters, conflicts and lore. NO generic filler like "become the strongest" or "save the world" unless the lore explicitly demands it.
- Provide a DIVERSE MIX of plot DIRECTIONS across the 10 goals — ideally 10 clearly different kinds, for example: social, epic / heroic, political, personal, romantic, mysterious / investigative, economic, exploratory, moral / ethical, and factional. Do NOT cluster them all into one direction; spread them across as many directions as the lore plausibly supports.
- You may order them roughly from nearer-reachable to most distant and epic.
- Write each goal in GERMAN, as a single clear sentence.

OUTPUT FORMAT (STRICT):
Return ONLY a JSON array of exactly 10 strings and nothing else. No markdown, no commentary, no keys.
Example: ["Ziel eins ...", "Ziel zwei ...", "..."]`;

// ---------------------------------------------------------------- Labels
const LABELS: Record<string, string> = {
  time: 'Zeit',
  timeElapsed: 'Vergangen',
  location: 'Ort',
  weather: 'Wetter',
  changeLog: 'Änderungen',
  primaryTopic: 'Hauptthema',
  emotionalTone: 'Grundton',
  interactionTheme: 'Interaktion',
  height: 'Größe',
  build: 'Statur',
  hair: 'Haare',
  eyeColor: 'Augen',
  makeup: 'Make-up',
  outfit: 'Outfit',
  stateOfDress: 'Zustand',
  money: 'Geld',
  weapons: 'Waffen',
  belongings: 'Gegenstände',
  postureAndInteraction: 'Position',
  physicalState: 'Verfassung',
  emotionalState: 'Stimmung',
  thoughts: 'Gedanken',
  goals: 'Ziele',
  knowledgeState: 'Wissen',
  secrets: 'Geheimnisse',
};

function humanize(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}
const label = (key: string) => LABELS[key] ?? humanize(key);

const CHAR_GROUPS: { key: string; title: string; icon: string }[] = [
  { key: 'appearance', title: 'Aussehen', icon: '🧍' },
  { key: 'clothing', title: 'Kleidung', icon: '👕' },
  { key: 'inventory', title: 'Inventar', icon: '🎒' },
  { key: 'condition', title: 'Körper', icon: '💪' },
  { key: 'mind', title: 'Geist', icon: '🧠' },
];

const AUTO_MODE_OPTIONS: { value: string; label: string }[] = [
  { value: 'none', label: 'Aus' },
  { value: 'responses', label: 'Antworten verarbeiten' },
  { value: 'inputs', label: 'Eingaben verarbeiten' },
  { value: 'both', label: 'Beides verarbeiten' },
];

// ---------------------------------------------------------------- Tracker lesen
function getLatestTracker(): any | null {
  try {
    const ctx = SillyTavern.getContext();
    const chat = ctx?.chat;
    if (!Array.isArray(chat)) return null;
    for (let i = chat.length - 1; i >= 0; i--) {
      const slot = chat[i]?.extra?.[EXTENSION_KEY];
      if (slot && slot[VALUE_KEY]) return slot[VALUE_KEY];
    }
  } catch (e) {
    console.error('[WTracker Panel] read error', e);
  }
  return null;
}

// ---------------------------------------------------------------- Bild-Speicher
function loadImage(name: string): string | null {
  try {
    const ctx: any = SillyTavern.getContext();
    return ctx.extensionSettings?.[IMG_KEY]?.[name] ?? null;
  } catch {
    return null;
  }
}
function saveImage(name: string, url: string): void {
  const ctx: any = SillyTavern.getContext();
  if (!ctx.extensionSettings[IMG_KEY]) ctx.extensionSettings[IMG_KEY] = {};
  ctx.extensionSettings[IMG_KEY][name] = url;
  ctx.saveSettingsDebounced();
}
function clearImage(name: string): void {
  const ctx: any = SillyTavern.getContext();
  if (ctx.extensionSettings?.[IMG_KEY]?.[name]) {
    delete ctx.extensionSettings[IMG_KEY][name];
    ctx.saveSettingsDebounced();
  }
}

// ---------------------------------------------------------------- Hauptplot-Speicher (chat-weit)
type PlotGoal = { text: string; done: boolean };

function loadPlot(): PlotGoal[] {
  try {
    const ctx: any = SillyTavern.getContext();
    const data = ctx.chatMetadata?.[EXTENSION_KEY]?.[PLOT_KEY];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
function savePlot(goals: PlotGoal[]): void {
  try {
    const ctx: any = SillyTavern.getContext();
    if (!ctx.chatMetadata[EXTENSION_KEY]) ctx.chatMetadata[EXTENSION_KEY] = {};
    ctx.chatMetadata[EXTENSION_KEY][PLOT_KEY] = goals;
    ctx.saveMetadataDebounced();
  } catch (e) {
    console.error('[WTracker Panel] plot save error', e);
  }
  applyPlotInjection(goals);
}

// Injiziert die offenen Ziele dauerhaft in den Spiel-Kontext.
function applyPlotInjection(goals: PlotGoal[]): void {
  try {
    const ctx: any = SillyTavern.getContext();
    if (typeof ctx.setExtensionPrompt !== 'function') return;
    const open = goals.filter((g) => !g.done);
    if (!open.length) {
      ctx.setExtensionPrompt(PLOT_PROMPT_KEY, '', 1, 4);
      return;
    }
    const text =
      'Übergeordnete, langfristige Hauptziele dieser Geschichte (Hintergrund-Richtung — nicht erzwingen, aber konsistent und glaubwürdig darauf hinarbeiten):\n' +
      open.map((g, i) => `${i + 1}. ${g.text}`).join('\n');
    ctx.setExtensionPrompt(PLOT_PROMPT_KEY, text, 1, 4);
  } catch (e) {
    console.error('[WTracker Panel] plot injection error', e);
  }
}

// ---------------------------------------------------------------- Lorebook: ALLE Einträge laden
async function gatherAllLorebookEntries(): Promise<string> {
  const ctx: any = SillyTavern.getContext();
  const bookNames = new Set<string>();

  // Global ausgewählte Bücher
  try {
    const g = ctx.world_info?.globalSelect ?? ctx.selected_world_info ?? (globalThis as any).selected_world_info;
    if (Array.isArray(g)) g.forEach((n: string) => n && bookNames.add(n));
  } catch {}

  // An den aktuellen Chat gebundenes Buch
  try {
    const chatBook = ctx.chatMetadata?.world_info;
    if (typeof chatBook === 'string' && chatBook) bookNames.add(chatBook);
  } catch {}

  // An die Charakterkarte gebundene Bücher (primär + zusätzliche)
  try {
    const ch = ctx.characters?.[ctx.characterId];
    const primary = ch?.data?.extensions?.world;
    if (typeof primary === 'string' && primary) bookNames.add(primary);
    const extra = ctx.characters?.[ctx.characterId]?.data?.extensions?.world_info;
    if (Array.isArray(extra)) extra.forEach((n: string) => n && bookNames.add(n));
  } catch {}

  const parts: string[] = [];

  // Alle gefundenen Bücher laden
  for (const name of bookNames) {
    try {
      const book = await ctx.loadWorldInfo(name);
      const entries = book?.entries;
      if (!entries) continue;
      for (const key of Object.keys(entries)) {
        const e = entries[key];
        if (!e || e.disable) continue;
        const keys = Array.isArray(e.key) ? e.key.join(', ') : '';
        const head = (e.comment || keys || '').toString().trim();
        const content = (e.content || '').toString().trim();
        if (content) parts.push(head ? `[${head}]\n${content}` : content);
      }
    } catch (err) {
      console.warn('[WTracker Panel] konnte Lorebook nicht laden:', name, err);
    }
  }

  // Eingebettetes Charakter-Lorebook (character_book) zusätzlich
  try {
    const cb = ctx.characters?.[ctx.characterId]?.data?.character_book;
    if (cb?.entries?.length) {
      for (const e of cb.entries) {
        const content = (e?.content || '').toString().trim();
        const keys = Array.isArray(e?.keys) ? e.keys.join(', ') : '';
        if (content) parts.push(keys ? `[${keys}]\n${content}` : content);
      }
    }
  } catch {}

  console.log(
    `[WTracker Panel] Lorebook-Einträge geladen: ${parts.length} (Bücher: ${[...bookNames].join(', ') || 'keine'})`,
  );
  return parts.join('\n\n---\n\n');
}

// ---------------------------------------------------------------- Quellmaterial sammeln
async function gatherSourceMaterial(): Promise<string> {
  const ctx: any = SillyTavern.getContext();
  const blocks: string[] = [];

  // Spielercharakter / Persona
  try {
    const pName = ctx.name1 ?? 'Spieler';
    let pDesc = '';
    try {
      pDesc = ctx.powerUserSettings?.persona_description ?? ctx.persona_description ?? '';
    } catch {}
    blocks.push(`### Spielercharakter\nName: ${pName}\n${pDesc}`.trim());
  } catch {}

  // Hauptcharakter (Charakterkarte)
  try {
    const ch = ctx.characters?.[ctx.characterId];
    if (ch) {
      const card = [
        ch.name && `Name: ${ch.name}`,
        ch.description && `Beschreibung: ${ch.description}`,
        ch.personality && `Persönlichkeit: ${ch.personality}`,
        ch.scenario && `Szenario: ${ch.scenario}`,
      ]
        .filter(Boolean)
        .join('\n');
      if (card) blocks.push(`### Hauptcharakter\n${card}`);
    }
  } catch (e) {
    console.warn('[WTracker Panel] char read failed', e);
  }

  // World Info / Lorebook — ALLE Einträge aus allen aktiven Büchern
  try {
    const ents = await gatherAllLorebookEntries();
    if (ents) blocks.push(`### Lorebook / World Info\n${ents}`);
  } catch (e) {
    console.warn('[WTracker Panel] world info read failed', e);
  }

  // Aktueller Szenen-Zustand
  try {
    const t = getLatestTracker();
    if (t) blocks.push(`### Aktueller Szenen-Zustand (Tracker)\n${JSON.stringify(t, null, 2)}`);
  } catch {}

  const text = blocks.join('\n\n');
  console.log('[WTracker Panel] Hauptplot-Quellmaterial:\n', text);
  return (
    text ||
    'Keine besonderen Quellinformationen verfügbar. Erfinde einen passenden, in sich stimmigen Fantasy-Hauptplot.'
  );
}

// ---------------------------------------------------------------- Plot generieren
function parseGoals(raw: string): string[] {
  let text = String(raw ?? '').trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  try {
    const arr = JSON.parse(text);
    if (Array.isArray(arr)) {
      return arr
        .map((x) => String(x).trim())
        .filter(Boolean)
        .slice(0, 10);
    }
  } catch {}
  return String(raw ?? '')
    .split('\n')
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim())
    .filter((l) => l.length > 0 && !/^```/.test(l))
    .slice(0, 10);
}

async function generatePlotGoals(): Promise<string[]> {
  const settings = settingsManager.getSettings();
  if (!settings.profileId) {
    throw new Error('Kein Connection Profile in den WTracker-Settings gewählt.');
  }
  const source = await gatherSourceMaterial();
  const messages = [
    { role: 'system', content: MAIN_PLOT_PROMPT },
    { role: 'user', content: source },
  ] as unknown as Message[];

  const data: any = await new Promise((resolve, reject) => {
    const abortController = new AbortController();
    plotGenerator.generateRequest(
      {
        profileId: settings.profileId,
        prompt: messages,
        maxTokens: 2000,
        custom: { signal: abortController.signal },
      } as any,
      {
        abortController,
        onStart: () => {},
        onFinish: (_id: any, d: any, err: any) => {
          if (err) return reject(err);
          if (!d) return reject(new Error('Generierung abgebrochen.'));
          resolve(d);
        },
      } as any,
    );
  });

  const content = typeof data === 'string' ? data : data?.content;
  if (!content) throw new Error('Keine Antwort vom Modell erhalten.');
  return parseGoals(content);
}

// ---------------------------------------------------------------- Bild-Helfer
function buildImagePrompt(c: any): string {
  const a = c?.appearance ?? {};
  const parts = [
    c?.race,
    c?.gender,
    a.build,
    a.hair && `${a.hair} hair`,
    a.eyeColor && `${a.eyeColor} eyes`,
    a.makeup && a.makeup !== 'Kein Make-up' ? a.makeup : null,
    c?.clothing?.outfit,
    'solo portrait, detailed character portrait',
  ].filter(Boolean);
  return parts
    .join(', ')
    .replace(/[\r\n|]+/g, ' ')
    .replace(/\{\{|\}\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function generateImageUrl(prompt: string): Promise<string | null> {
  const ctx: any = SillyTavern.getContext();
  const exec = ctx.executeSlashCommandsWithOptions ?? ctx.executeSlashCommands;
  if (!exec) throw new Error('Slash-Command-API nicht verfügbar.');
  const res = await exec.call(ctx, `/sd quiet=true solo portrait ${prompt}`);
  const url = typeof res === 'string' ? res : res?.pipe;
  return typeof url === 'string' && url.trim() ? url.trim() : null;
}

// ---------------------------------------------------------------- generische Wertdarstellung
const isPrimitive = (v: any) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
const isEmpty = (v: any) =>
  v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

function renderSecrets(text: string): React.ReactNode {
  const parts = text.split(/(\((?:verborgen|angedeutet|aufgedeckt)\))/gi);
  return parts.map((p, i) => {
    const m = p.toLowerCase();
    if (m === '(verborgen)') return <span key={i} style={tag('#c0392b')}>verborgen</span>;
    if (m === '(angedeutet)') return <span key={i} style={tag('#b9770e')}>angedeutet</span>;
    if (m === '(aufgedeckt)') return <span key={i} style={tag('#1e8449')}>aufgedeckt</span>;
    return <span key={i}>{p}</span>;
  });
}

function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (/(verbünd|freund|geliebt|vertrau|alliier|gefährt)/.test(s)) return '#1e8449';
  if (/(rival|feind|gegner|misstrau|hass)/.test(s)) return '#c0392b';
  if (/(fremd|unbekannt|neutral)/.test(s)) return '#7f8c8d';
  return '#5b7fb4';
}

function Chips({ items }: { items: any[] }): React.ReactElement {
  return (
    <div style={styles.chipWrap}>
      {items.map((it, i) => (
        <span key={i} style={styles.chip}>
          {String(it)}
        </span>
      ))}
    </div>
  );
}

function Value({ field, value }: { field: string; value: any }): React.ReactElement {
  if (isEmpty(value)) return <span style={styles.muted}>—</span>;
  if (field === 'secrets' && typeof value === 'string') return <>{renderSecrets(value)}</>;
  if (Array.isArray(value)) {
    if (value.every(isPrimitive)) return <Chips items={value} />;
    return (
      <div style={styles.subList}>
        {value.map((item, i) => (
          <div key={i} style={styles.subItem}>
            {Object.entries(item).map(([k, v]) => (
              <Row key={k} k={k} v={v} />
            ))}
          </div>
        ))}
      </div>
    );
  }
  if (isPrimitive(value)) return <span>{String(value)}</span>;
  return (
    <div style={styles.objBlock}>
      {Object.entries(value).map(([k, v]) => (
        <Row key={k} k={k} v={v} />
      ))}
    </div>
  );
}

function Row({ k, v }: { k: string; v: any }): React.ReactElement {
  return (
    <div style={styles.row}>
      <span style={styles.rowLabel}>{label(k)}</span>
      <span style={styles.rowValue}>
        <Value field={k} value={v} />
      </span>
    </div>
  );
}

function GroupBlock({ title, icon, obj }: { title: string; icon: string; obj: any }): React.ReactElement {
  return (
    <div style={styles.group}>
      <div style={styles.groupHead}>
        <span style={styles.groupIcon}>{icon}</span>
        {title}
      </div>
      <div style={styles.groupBody}>
        {Object.entries(obj).map(([k, v]) => (
          <Row key={k} k={k} v={v} />
        ))}
      </div>
    </div>
  );
}

function Relationships({ list }: { list: any[] }): React.ReactElement {
  return (
    <div style={styles.group}>
      <div style={styles.groupHead}>
        <span style={styles.groupIcon}>🤝</span>
        Beziehungen
      </div>
      <div style={styles.groupBody}>
        {list.length === 0 ? (
          <span style={styles.muted}>—</span>
        ) : (
          list.map((rel, i) => (
            <div key={i} style={styles.relRow}>
              <span style={styles.relTarget}>{rel.target}</span>
              <span style={tag(statusColor(rel.status ?? ''))}>{rel.status}</span>
              <span style={styles.relDynamic}>{rel.dynamic}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- einklappbare Sektion
function CollapsibleSection({
  title,
  icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={styles.section}>
      <div style={styles.sectionHead} onClick={() => setOpen((o) => !o)}>
        <span style={styles.sectionTitleText}>
          {icon} {title}
        </span>
        <span style={styles.cardToggle}>{open ? '▾' : '▸'}</span>
      </div>
      {open && <div style={styles.sectionBody}>{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Allgemein-Inhalt
function SceneContent({ data }: { data: any }): React.ReactElement {
  const topics = data.topics
    ? [data.topics.primaryTopic, data.topics.emotionalTone, data.topics.interactionTheme].filter(Boolean)
    : [];
  return (
    <div>
      <div style={styles.timeBig}>{data.time ?? '—'}</div>
      {data.timeElapsed && <div style={styles.timeElapsed}>⏱ {data.timeElapsed}</div>}
      {data.location && <Row k="location" v={data.location} />}
      {data.weather && <Row k="weather" v={data.weather} />}
      {data.changeLog && (
        <div style={styles.changeLog}>
          <span style={styles.rowLabel}>Änderungen</span>
          <span style={styles.changeLogText}>{data.changeLog}</span>
        </div>
      )}
      {topics.length > 0 && (
        <div style={styles.row}>
          <span style={styles.rowLabel}>Themen</span>
          <span style={styles.rowValue}>
            <Chips items={topics} />
          </span>
        </div>
      )}
      {Array.isArray(data.charactersPresent) && data.charactersPresent.length > 0 && (
        <div style={styles.row}>
          <span style={styles.rowLabel}>Anwesend</span>
          <span style={styles.rowValue}>
            <Chips items={data.charactersPresent} />
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Hauptplot-UI (Dauer-Builder)
function MainPlotSection(props: {
  goals: PlotGoal[];
  suggestions: string[];
  busy: boolean;
  err: string | null;
  isInPlot: (text: string) => boolean;
  onGenerate: () => void;
  onClearSuggestions: () => void;
  onToggleSuggestion: (text: string) => void;
  onToggleGoalDone: (i: number) => void;
}): React.ReactElement {
  const {
    goals,
    suggestions,
    busy,
    err,
    isInPlot,
    onGenerate,
    onClearSuggestions,
    onToggleSuggestion,
    onToggleGoalDone,
  } = props;

  const doneCount = goals.filter((g) => g.done).length;

  return (
    <div>
      {goals.length > 0 && (
        <div style={{ marginBottom: '10px' }}>
          <div style={styles.plotProgress}>
            Aktive Hauptplots — {doneCount} / {goals.length} erreicht
          </div>
          {goals.map((g, i) => (
            <label key={i} style={styles.goalRow}>
              <input
                type="checkbox"
                checked={g.done}
                onChange={() => onToggleGoalDone(i)}
                style={styles.goalCheck}
                title="Als erreicht/erledigt markieren"
              />
              <span style={g.done ? styles.goalTextDone : styles.goalText}>{g.text}</span>
            </label>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <div style={styles.suggestBox}>
          <div style={styles.suggestHead}>
            <span>Vorschläge — anhaken zum Übernehmen</span>
            <button style={styles.miniBtn} onClick={onClearSuggestions} title="Vorschläge schließen">
              ✕
            </button>
          </div>
          {suggestions.map((s, i) => (
            <label key={i} style={styles.goalRow}>
              <input
                type="checkbox"
                checked={isInPlot(s)}
                onChange={() => onToggleSuggestion(s)}
                style={styles.goalCheck}
                title="In den Hauptplot übernehmen"
              />
              <span style={isInPlot(s) ? styles.suggestAdded : styles.goalText}>{s}</span>
            </label>
          ))}
        </div>
      )}

      {goals.length === 0 && suggestions.length === 0 && (
        <div style={styles.plotHint}>
          Noch kein Hauptplot. Generiere Vorschläge und hake an, was dir gefällt — du kannst beliebig oft
          nachgenerieren und weitere übernehmen.
        </div>
      )}

      <div style={{ marginTop: '8px' }}>
        <button style={styles.genBtn} onClick={onGenerate} disabled={busy}>
          {busy ? '⏳ Generiere…' : suggestions.length > 0 ? '🎲 Weitere 10 würfeln' : '🎯 Vorschläge generieren'}
        </button>
      </div>
      {err && <div style={styles.errText}>{err}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Charakterkarte
function CharacterCard({ character }: { character: any }): React.ReactElement {
  const name = character?.name ?? 'Unbenannt';
  const meta = [character?.age, character?.gender, character?.race].filter(Boolean).join(' · ');

  const [open, setOpen] = useState(true);
  const [img, setImg] = useState<string | null>(() => loadImage(name));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setImg(loadImage(name));
    setErr(null);
  }, [name]);

  const handleGenerate = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const prompt = buildImagePrompt(character);
      const url = await generateImageUrl(prompt);
      if (url) {
        saveImage(name, url);
        setImg(url);
      } else {
        setErr('Keine Bild-URL erhalten.');
      }
    } catch (e: any) {
      console.error('[WTracker Panel] image gen error', e);
      setErr(e?.message ?? 'Fehler bei der Generierung.');
    } finally {
      setBusy(false);
    }
  }, [busy, character, name]);

  const handleUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result);
        saveImage(name, url);
        setImg(url);
        setErr(null);
      };
      reader.onerror = () => setErr('Datei konnte nicht gelesen werden.');
      reader.readAsDataURL(file);
    },
    [name],
  );

  const handleClear = useCallback(() => {
    clearImage(name);
    setImg(null);
  }, [name]);

  const handled = new Set([
    'name',
    'age',
    'gender',
    'race',
    'relationships',
    'quests',
    'skills',
    ...CHAR_GROUPS.map((g) => g.key),
  ]);
  const extraKeys = Object.keys(character).filter((k) => !handled.has(k));

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader} onClick={() => setOpen((o) => !o)}>
        <span style={styles.cardName}>{name}</span>
        {meta && <span style={styles.cardMeta}>{meta}</span>}
        <span style={styles.cardToggle}>{open ? '▾' : '▸'}</span>
      </div>

      {open && (
        <div style={styles.cardBody}>
          <div style={styles.portraitWrap}>
            {img ? (
              <img src={img} alt={name} style={styles.portrait} />
            ) : (
              <div style={styles.portraitPlaceholder}>
                <span style={{ opacity: 0.5 }}>kein Bild</span>
              </div>
            )}
          </div>

          <div style={styles.imgButtons}>
            <button style={styles.genBtn} onClick={handleGenerate} disabled={busy}>
              {busy ? '⏳ Generiere…' : img ? '🎨 Neu' : '🎨 Generieren'}
            </button>
            <label style={styles.uploadBtn} title="Bild hochladen">
              ⬆ Hochladen
              <input type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
            </label>
            <button style={styles.clearBtn} onClick={handleClear} disabled={!img} title="Bild entfernen">
              🗑
            </button>
          </div>
          {err && <div style={styles.errText}>{err}</div>}

          {CHAR_GROUPS.map(
            (g) =>
              character[g.key] && <GroupBlock key={g.key} title={g.title} icon={g.icon} obj={character[g.key]} />,
          )}
          {Array.isArray(character.relationships) && <Relationships list={character.relationships} />}
          {!isEmpty(character.quests) && (
            <div style={styles.group}>
              <div style={styles.groupHead}>
                <span style={styles.groupIcon}>📜</span>
                Quests
              </div>
              <div style={styles.groupBody}>
                <Chips items={character.quests} />
              </div>
            </div>
          )}
          {!isEmpty(character.skills) && (
            <div style={styles.group}>
              <div style={styles.groupHead}>
                <span style={styles.groupIcon}>⭐</span>
                Fähigkeiten
              </div>
              <div style={styles.groupBody}>
                <Chips items={character.skills} />
              </div>
            </div>
          )}
          {extraKeys.map((k) => (
            <Row key={k} k={k} v={character[k]} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Panel
function Panel(): React.ReactElement {
  const [open, setOpen] = useState(true);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const [autoMode, setAutoMode] = useState<string>(() => {
    try {
      return settingsManager.getSettings().autoMode as unknown as string;
    } catch {
      return 'none';
    }
  });
  const changeAutoMode = useCallback((v: string) => {
    try {
      const s = settingsManager.getSettings();
      s.autoMode = v as AutoModeOptions;
      settingsManager.saveSettings();
      setAutoMode(v);
    } catch (e) {
      console.error('[WTracker Panel] autoMode save error', e);
    }
  }, []);

  // Hauptplot-Zustand
  const [plotGoals, setPlotGoals] = useState<PlotGoal[]>(() => loadPlot());
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [plotBusy, setPlotBusy] = useState(false);
  const [plotErr, setPlotErr] = useState<string | null>(null);

  // Plot bei Chatwechsel/Mount neu laden + injizieren (läuft auch wenn Panel zu ist)
  useEffect(() => {
    const g = loadPlot();
    setPlotGoals(g);
    setSuggestions([]);
    setPlotErr(null);
    applyPlotInjection(g);
  }, [tick]);

  useEffect(() => {
    const es: any = SillyTavern.getContext().eventSource;
    const events = [
      EventNames.CHARACTER_MESSAGE_RENDERED,
      EventNames.USER_MESSAGE_RENDERED,
      EventNames.CHAT_CHANGED,
    ];
    events.forEach((e) => es.on(e, refresh));
    return () => {
      const off = es.removeListener || es.off;
      events.forEach((e) => off?.call(es, e, refresh));
    };
  }, [refresh]);

  const genSuggestions = useCallback(async () => {
    if (plotBusy) return;
    setPlotBusy(true);
    setPlotErr(null);
    try {
      const goals = await generatePlotGoals();
      if (!goals.length) setPlotErr('Keine Vorschläge erhalten — Antwort des Modells prüfen (Konsole).');
      else setSuggestions(goals);
    } catch (e: any) {
      console.error('[WTracker Panel] plot gen error', e);
      setPlotErr(e?.message ?? 'Fehler bei der Generierung.');
    } finally {
      setPlotBusy(false);
    }
  }, [plotBusy]);

  const isInPlot = useCallback((text: string) => plotGoals.some((g) => g.text === text), [plotGoals]);

  const toggleSuggestion = useCallback((text: string) => {
    setPlotGoals((prev) => {
      const exists = prev.some((g) => g.text === text);
      const next = exists ? prev.filter((g) => g.text !== text) : [...prev, { text, done: false }];
      savePlot(next);
      return next;
    });
  }, []);

  const toggleGoalDone = useCallback((i: number) => {
    setPlotGoals((prev) => {
      const next = prev.map((g, idx) => (idx === i ? { ...g, done: !g.done } : g));
      savePlot(next);
      return next;
    });
  }, []);

  const clearSuggestions = useCallback(() => setSuggestions([]), []);

  const tracker = useMemo(() => getLatestTracker(), [tick]);
  const characters = Array.isArray(tracker?.characters) ? tracker.characters : [];

  if (!open) {
    return (
      <button style={styles.reopenTab} onClick={() => setOpen(true)} title="Tracker öffnen">
        📋
      </button>
    );
  }

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>Scene Tracker</span>
        <div style={styles.headerButtons}>
          <button style={styles.iconBtn} onClick={refresh} title="Aktualisieren">
            ⟳
          </button>
          <button style={styles.iconBtn} onClick={() => setOpen(false)} title="Einklappen">
            ✕
          </button>
        </div>
      </div>

      <div style={styles.autoModeRow}>
        <label style={styles.autoModeLabel}>Auto Mode</label>
        <select style={styles.autoModeSelect} value={autoMode} onChange={(e) => changeAutoMode(e.target.value)}>
          {AUTO_MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div style={styles.body}>
        <CollapsibleSection title="Allgemein" icon="📋">
          {tracker ? <SceneContent data={tracker} /> : <div style={styles.muted}>Noch keine Tracker-Daten.</div>}
        </CollapsibleSection>

        <CollapsibleSection title="Hauptplot" icon="🎯">
          <MainPlotSection
            goals={plotGoals}
            suggestions={suggestions}
            busy={plotBusy}
            err={plotErr}
            isInPlot={isInPlot}
            onGenerate={genSuggestions}
            onClearSuggestions={clearSuggestions}
            onToggleSuggestion={toggleSuggestion}
            onToggleGoalDone={toggleGoalDone}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Charaktere" icon="🎭">
          {characters.length > 0 ? (
            characters.map((c: any, i: number) => <CharacterCard key={c?.name ?? i} character={c} />)
          ) : (
            <div style={styles.muted}>Keine Charaktere im aktuellen Tracker.</div>
          )}
        </CollapsibleSection>
      </div>
    </div>
  );
}

export function mountTrackerPanel(): void {
  const id = 'wtracker-panel-root';
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
  createRoot(el).render(
    <React.StrictMode>
      <Panel />
    </React.StrictMode>,
  );
}

// ---------------------------------------------------------------- Styles
function tag(color: string): React.CSSProperties {
  return {
    display: 'inline-block',
    background: color,
    color: '#fff',
    borderRadius: '4px',
    padding: '1px 6px',
    fontSize: '0.7rem',
    fontWeight: 600,
    margin: '0 2px',
    whiteSpace: 'nowrap',
  };
}

const styles = {
  panel: {
    position: 'fixed',
    top: '60px',
    right: '12px',
    width: '360px',
    maxHeight: '82vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--SmartThemeBlurTintColor, rgba(22,22,28,0.96))',
    color: 'var(--SmartThemeBodyColor, #e8e8e8)',
    border: '1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.14))',
    borderRadius: '12px',
    boxShadow: '0 10px 34px rgba(0,0,0,0.5)',
    zIndex: 4000,
    fontSize: '0.84rem',
    backdropFilter: 'blur(8px)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '9px 12px',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0))',
    borderBottom: '1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.12))',
  },
  title: { fontWeight: 700, fontSize: '0.92rem', letterSpacing: '0.02em' },
  headerButtons: { display: 'flex', gap: '4px' },
  iconBtn: {
    background: 'transparent',
    color: 'inherit',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.95rem',
    padding: '3px 7px',
    borderRadius: '5px',
    lineHeight: 1,
  },
  autoModeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 12px',
    borderBottom: '1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.1))',
    background: 'rgba(255,255,255,0.03)',
  },
  autoModeLabel: { fontSize: '0.76rem', fontWeight: 600, opacity: 0.75, whiteSpace: 'nowrap' },
  autoModeSelect: {
    flex: 1,
    background: 'var(--SmartThemeBlurTintColor, rgba(0,0,0,0.3))',
    color: 'inherit',
    border: '1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.2))',
    borderRadius: '6px',
    padding: '4px 6px',
    fontSize: '0.78rem',
    cursor: 'pointer',
  },
  body: { padding: '10px 12px', overflowY: 'auto' },
  reopenTab: {
    position: 'fixed',
    top: '60px',
    right: '12px',
    zIndex: 4000,
    background: 'var(--SmartThemeBlurTintColor, rgba(22,22,28,0.96))',
    color: 'var(--SmartThemeBodyColor, #e8e8e8)',
    border: '1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.14))',
    borderRadius: '10px',
    padding: '7px 10px',
    cursor: 'pointer',
    fontSize: '1.05rem',
    boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
  },
  section: {
    border: '1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.1))',
    borderRadius: '10px',
    marginBottom: '10px',
    overflow: 'hidden',
    background: 'rgba(255,255,255,0.03)',
  },
  sectionHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 11px',
    cursor: 'pointer',
    userSelect: 'none',
    fontWeight: 700,
    fontSize: '0.82rem',
    letterSpacing: '0.03em',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0))',
  },
  sectionTitleText: { textTransform: 'uppercase', opacity: 0.85 },
  sectionBody: { padding: '9px 11px' },
  timeBig: { fontSize: '1.05rem', fontWeight: 700, letterSpacing: '0.01em' },
  timeElapsed: { fontSize: '0.74rem', opacity: 0.65, fontStyle: 'italic', marginBottom: '6px' },
  changeLog: { marginTop: '4px' },
  changeLogText: { fontStyle: 'italic', opacity: 0.9, display: 'block', marginTop: '2px' },
  plotHint: { fontSize: '0.78rem', opacity: 0.7, marginBottom: '8px', lineHeight: 1.4 },
  plotProgress: {
    fontSize: '0.74rem',
    fontWeight: 700,
    opacity: 0.7,
    marginBottom: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  suggestBox: {
    border: '1px dashed var(--SmartThemeBorderColor, rgba(255,255,255,0.2))',
    borderRadius: '8px',
    padding: '7px 9px',
    marginBottom: '8px',
    background: 'rgba(255,255,255,0.03)',
  },
  suggestHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.72rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    opacity: 0.7,
    marginBottom: '6px',
  },
  miniBtn: {
    background: 'transparent',
    color: 'inherit',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.85rem',
    opacity: 0.7,
    lineHeight: 1,
  },
  suggestAdded: { flex: 1, color: '#7ec699', fontWeight: 600 },
  goalRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '7px',
    marginBottom: '6px',
    cursor: 'pointer',
    lineHeight: 1.4,
  },
  goalCheck: { marginTop: '3px', flexShrink: 0, cursor: 'pointer' },
  goalText: { flex: 1 },
  goalTextDone: { flex: 1, textDecoration: 'line-through', opacity: 0.5 },
  card: {
    border: '1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.12))',
    borderRadius: '10px',
    marginBottom: '10px',
    overflow: 'hidden',
  },
  portraitWrap: {
    width: '100%',
    background: 'rgba(0,0,0,0.25)',
    borderRadius: '8px',
    overflow: 'hidden',
    marginBottom: '8px',
  },
  portrait: { width: '100%', height: 'auto', maxHeight: '340px', objectFit: 'cover', display: 'block' },
  portraitPlaceholder: {
    width: '100%',
    height: '120px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.78rem',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    padding: '8px 10px',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
    borderBottom: '1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.1))',
    cursor: 'pointer',
    userSelect: 'none',
  },
  cardName: { fontWeight: 700, fontSize: '0.95rem' },
  cardMeta: { fontSize: '0.74rem', opacity: 0.6 },
  cardToggle: { opacity: 0.6, fontSize: '0.8rem' },
  imgButtons: { display: 'flex', gap: '6px', marginBottom: '6px' },
  genBtn: {
    flex: 1,
    width: '100%',
    background: 'var(--crimson70a, rgba(91,127,180,0.25))',
    color: 'inherit',
    border: '1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.18))',
    borderRadius: '6px',
    padding: '6px 8px',
    cursor: 'pointer',
    fontSize: '0.78rem',
    fontWeight: 600,
  },
  uploadBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    background: 'transparent',
    color: 'inherit',
    border: '1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.18))',
    borderRadius: '6px',
    padding: '5px 9px',
    cursor: 'pointer',
    fontSize: '0.78rem',
    whiteSpace: 'nowrap',
  },
  clearBtn: {
    background: 'transparent',
    color: 'inherit',
    border: '1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.18))',
    borderRadius: '6px',
    padding: '5px 9px',
    cursor: 'pointer',
    fontSize: '0.78rem',
  },
  errText: { color: '#e06c75', fontSize: '0.74rem', marginTop: '4px' },
  cardBody: { padding: '8px 10px' },
  group: { marginBottom: '8px' },
  groupHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    fontWeight: 700,
    fontSize: '0.74rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    opacity: 0.7,
    paddingBottom: '3px',
    borderBottom: '1px dashed var(--SmartThemeBorderColor, rgba(255,255,255,0.12))',
    marginBottom: '4px',
  },
  groupIcon: { fontSize: '0.85rem' },
  groupBody: { paddingLeft: '2px' },
  row: { display: 'flex', gap: '6px', marginBottom: '3px', lineHeight: 1.4 },
  rowLabel: { fontWeight: 600, opacity: 0.7, fontSize: '0.76rem', minWidth: '74px', flexShrink: 0 },
  rowValue: { whiteSpace: 'pre-wrap', flex: 1 },
  muted: { opacity: 0.45, fontStyle: 'italic' },
  objBlock: { paddingLeft: '6px' },
  subList: { display: 'flex', flexDirection: 'column', gap: '4px' },
  subItem: {
    borderLeft: '2px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.18))',
    paddingLeft: '6px',
  },
  chipWrap: { display: 'flex', flexWrap: 'wrap', gap: '4px' },
  chip: {
    background: 'rgba(255,255,255,0.09)',
    border: '1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.14))',
    borderRadius: '5px',
    padding: '1px 7px',
    fontSize: '0.76rem',
  },
  relRow: { display: 'flex', alignItems: 'baseline', gap: '5px', flexWrap: 'wrap', marginBottom: '4px' },
  relTarget: { fontWeight: 600 },
  relDynamic: { opacity: 0.85, fontSize: '0.78rem' },
} satisfies Record<string, React.CSSProperties>;