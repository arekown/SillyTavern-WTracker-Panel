import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { EventNames } from 'sillytavern-utils-lib/types';
import { AutoModeOptions } from 'sillytavern-utils-lib/types/translate';
import { EXTENSION_KEY } from '../config.js';
import { settingsManager } from './Settings.js';

const VALUE_KEY = 'value';
const IMG_KEY = 'WTrackerPanelImages';

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

function SceneHeader({ data }: { data: any }): React.ReactElement {
  const [open, setOpen] = useState(true);
  const topics = data.topics
    ? [data.topics.primaryTopic, data.topics.emotionalTone, data.topics.interactionTheme].filter(Boolean)
    : [];
  return (
    <div style={styles.scene}>
      <div style={styles.sceneHead} onClick={() => setOpen((o) => !o)}>
        <span style={styles.timeBig}>{data.time ?? '—'}</span>
        <span style={styles.cardToggle}>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div style={styles.sceneBody}>
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
      )}
    </div>
  );
}

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
        <select
          style={styles.autoModeSelect}
          value={autoMode}
          onChange={(e) => changeAutoMode(e.target.value)}
        >
          {AUTO_MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div style={styles.body}>
        {!tracker ? (
          <div style={styles.muted}>Noch keine Tracker-Daten in diesem Chat.</div>
        ) : (
          <>
            <SceneHeader data={tracker} />
            {characters.length > 0 && (
              <>
                <div style={styles.sectionTitle}>Charaktere</div>
                {characters.map((c: any, i: number) => (
                  <CharacterCard key={c?.name ?? i} character={c} />
                ))}
              </>
            )}
          </>
        )}
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
  scene: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.1))',
    borderRadius: '10px',
    padding: '7px 11px 9px',
    marginBottom: '10px',
  },
  sceneHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    userSelect: 'none',
  },
  sceneBody: { marginTop: '6px' },
  timeBig: { fontSize: '1.05rem', fontWeight: 700, letterSpacing: '0.01em' },
  timeElapsed: { fontSize: '0.74rem', opacity: 0.65, fontStyle: 'italic', marginBottom: '6px' },
  changeLog: { marginTop: '4px' },
  changeLogText: { fontStyle: 'italic', opacity: 0.9, display: 'block', marginTop: '2px' },
  sectionTitle: {
    fontWeight: 700,
    opacity: 0.55,
    fontSize: '0.72rem',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    margin: '6px 0 4px',
  },
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
  cardToggle: { marginLeft: 'auto', opacity: 0.6, fontSize: '0.8rem' },
  imgButtons: { display: 'flex', gap: '6px', marginBottom: '6px' },
  genBtn: {
    flex: 1,
    background: 'var(--crimson70a, rgba(91,127,180,0.25))',
    color: 'inherit',
    border: '1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.18))',
    borderRadius: '6px',
    padding: '5px 8px',
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
  errText: { color: '#e06c75', fontSize: '0.74rem', marginBottom: '4px' },
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