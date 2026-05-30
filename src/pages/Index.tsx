/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect, useCallback } from "react";
import Icon from "@/components/ui/icon";

const API_GENERATE = "https://functions.poehali.dev/41ee0003-70f4-4f10-9198-9c316970c345";
const API_CHECK = "https://functions.poehali.dev/a4867ee5-4dfc-4ec4-bf50-f3681ee61227";
const API_TEXT = "https://functions.poehali.dev/9ea548b8-684b-434d-b439-9155c248db4d";
const API_TELEGRAM = "https://functions.poehali.dev/9eccc612-97a3-4548-84ab-17b8b16c323a";

type GenStatus = "idle" | "pending" | "running" | "done" | "error";

interface GeneratedClip {
  videoUrl: string;
  prompt: string;
  duration: number;
}

interface SavedProject {
  id: string;
  name: string;
  prompt: string;
  videoUrl: string;
  duration: number;
  savedAt: string; // ISO
}

const STORAGE_KEY = "frameforge_projects";

function loadProjects(): SavedProject[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function saveProjects(projects: SavedProject[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return `Сегодня, ${d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}`;
  if (diffDays === 1) return `Вчера, ${d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString("ru", { day: "numeric", month: "short" });
}

type Section = "editor" | "library" | "projects" | "settings" | "export" | "help";

const NAV_ITEMS: { id: Section; icon: string; label: string }[] = [
  { id: "editor", icon: "Film", label: "Редактор" },
  { id: "library", icon: "LayoutGrid", label: "Библиотека" },
  { id: "projects", icon: "FolderOpen", label: "Проекты" },
  { id: "settings", icon: "Settings2", label: "Настройки" },
  { id: "export", icon: "Share2", label: "Экспорт" },
  { id: "help", icon: "BookOpen", label: "Справка" },
];

const TIMELINE_TRACKS = [
  { label: "Видео 1", color: "bg-amber-500", clips: [{ w: 180, offset: 0 }, { w: 120, offset: 200 }, { w: 90, offset: 340 }] },
  { label: "Аудио", color: "bg-sky-500", clips: [{ w: 300, offset: 0 }, { w: 80, offset: 320 }] },
  { label: "Эффекты", color: "bg-violet-500", clips: [{ w: 60, offset: 80 }, { w: 100, offset: 220 }] },
  { label: "Текст", color: "bg-emerald-500", clips: [{ w: 140, offset: 50 }] },
];

const TEMPLATES = [
  { name: "Кино-драма", tags: ["ИИ", "4K"], color: "from-amber-900/40 to-orange-950/60" },
  { name: "Рекламный ролик", tags: ["Шаблон", "HD"], color: "from-sky-900/40 to-blue-950/60" },
  { name: "Sci-Fi интро", tags: ["ИИ", "FX"], color: "from-violet-900/40 to-purple-950/60" },
  { name: "Документальный", tags: ["Шаблон"], color: "from-emerald-900/40 to-green-950/60" },
  { name: "Музыкальный клип", tags: ["ИИ", "4K"], color: "from-rose-900/40 to-pink-950/60" },
  { name: "Корпоративный", tags: ["Шаблон", "HD"], color: "from-slate-800/40 to-zinc-900/60" },
];

const PROJECTS = [
  { name: "Рекламный ролик Nike", duration: "0:32", modified: "Сегодня, 14:22", status: "active" },
  { name: "Документальный фильм", duration: "12:47", modified: "Вчера, 09:15", status: "render" },
  { name: "Музыкальный клип", duration: "3:54", modified: "28 мая", status: "done" },
  { name: "Intro для YouTube", duration: "0:15", modified: "25 мая", status: "done" },
];

const AI_MODELS = [
  { name: "FrameForge Ultra", desc: "Максимальное качество, медленная генерация" },
  { name: "FrameForge Fast", desc: "Быстрая генерация, хорошее качество" },
  { name: "FrameForge Lite", desc: "Мгновенная генерация, базовое качество" },
];

const EXPORT_FORMATS = [
  { fmt: "MP4 H.264", res: "4K 3840×2160", fps: "60fps", size: "~2.4 GB" },
  { fmt: "MP4 H.265", res: "4K 3840×2160", fps: "60fps", size: "~1.1 GB" },
  { fmt: "ProRes 4444", res: "2K 2048×1080", fps: "24fps", size: "~8.2 GB" },
  { fmt: "WebM VP9", res: "1080p", fps: "30fps", size: "~320 MB" },
];

// ─── VIDEO STYLES ──────────────────────────────────────────────────────────────
const PRESET_STYLES = [
  { id: "cinematic", label: "Кинематограф", desc: "Широкоэкранный 2.39:1, мягкое боке", emoji: "🎬" },
  { id: "noir", label: "Нуар", desc: "Высокий контраст, тени, монохром", emoji: "🌑" },
  { id: "scifi", label: "Sci-Fi", desc: "Неоновые блики, технологичность", emoji: "🚀" },
  { id: "vintage", label: "Винтаж", desc: "Тёплые тона, зерно, ретро", emoji: "📽️" },
  { id: "documentary", label: "Документальный", desc: "Натуральный свет, реализм", emoji: "🎥" },
  { id: "anime", label: "Аниме", desc: "Яркие цвета, cel-shading", emoji: "✨" },
  { id: "horror", label: "Хоррор", desc: "Холодные тона, тёмные тени", emoji: "👁️" },
  { id: "commercial", label: "Реклама", desc: "Яркий, продающий, динамичный", emoji: "💡" },
];

const COLOR_PALETTE = [
  "#ff6b35","#ff4757","#ff3f81","#c44dff","#5352ed","#2196f3","#00b4d8","#00c3a0",
  "#00e676","#76ff03","#ffea00","#ff9100","#ff6d00","#8d6e63","#90a4ae","#546e7a",
  "#ffffff","#e0e0e0","#bdbdbd","#9e9e9e","#757575","#616161","#424242","#212121",
  "#ffd6e0","#c8e6c9","#bbdefb","#fff9c4","#f8bbd9","#d7ccc8","#b2ebf2","#dcedc8",
];

const VIDEO_FILTERS = [
  { id: "none",       label: "Без фильтра",   css: "none",                          preview: "bg-zinc-700" },
  { id: "warm",       label: "Тёплый",        css: "sepia(0.4) saturate(1.3)",      preview: "bg-amber-700/60" },
  { id: "cold",       label: "Холодный",      css: "hue-rotate(190deg) saturate(1.2)", preview: "bg-sky-700/60" },
  { id: "bw",         label: "Ч/Б",           css: "grayscale(1)",                  preview: "bg-zinc-500" },
  { id: "vintage",    label: "Винтаж",        css: "sepia(0.6) contrast(1.1)",      preview: "bg-yellow-800/60" },
  { id: "vivid",      label: "Насыщенный",    css: "saturate(2) contrast(1.1)",     preview: "bg-gradient-to-br from-purple-600 to-orange-500" },
  { id: "fade",       label: "Выцветший",     css: "opacity(0.8) saturate(0.7)",    preview: "bg-zinc-600/50" },
  { id: "sharp",      label: "Резкий",        css: "contrast(1.4) saturate(1.1)",   preview: "bg-zinc-800" },
  { id: "dreamy",     label: "Мечтательный",  css: "blur(0.5px) brightness(1.1) saturate(0.9)", preview: "bg-pink-400/40" },
];

const LAYER_TYPES = [
  { id: "text",    label: "Текст",       icon: "Type",       color: "text-amber-400"  },
  { id: "shape",   label: "Фигура",      icon: "Square",     color: "text-sky-400"    },
  { id: "logo",    label: "Логотип",     icon: "Image",      color: "text-violet-400" },
  { id: "blur",    label: "Размытие",    icon: "Droplets",   color: "text-cyan-400"   },
  { id: "overlay", label: "Оверлей",     icon: "Layers",     color: "text-emerald-400"},
  { id: "sticker", label: "Стикер",      icon: "Smile",      color: "text-rose-400"   },
];

interface Layer {
  id: string;
  type: string;
  label: string;
  visible: boolean;
  locked: boolean;
}

// ─── TOOL PANEL MODAL ──────────────────────────────────────────────────────────
type ToolType = "style" | "color" | "sound" | "text" | "layers" | "filters" | null;

function ToolsPanel({
  open,
  tool,
  onClose,
  onApplyStyle,
  onApplyColor,
  onApplyFilter,
  onAddLayer,
  onApplyText,
}: {
  open: boolean;
  tool: ToolType;
  onClose: () => void;
  onApplyStyle: (s: string) => void;
  onApplyColor: (c: string) => void;
  onApplyFilter: (f: string) => void;
  onAddLayer: (l: Layer) => void;
  onApplyText: (t: string) => void;
}) {
  // Style panel state
  const [customStyle, setCustomStyle] = useState("");
  // Color panel state
  const [customColor, setCustomColor] = useState("#ffffff");
  // Sound panel state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const audioInputRef = useRef<HTMLInputElement>(null);
  // Text panel state
  const [textTopic, setTextTopic] = useState("");
  const [textType, setTextType] = useState("заголовок");
  const [textStyle, setTextStyle] = useState("нейтральный");
  const [generatedText, setGeneratedText] = useState("");
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState("");
  // Layers state
  const [layers, setLayers] = useState<Layer[]>([
    { id: "1", type: "text", label: "Заголовок", visible: true, locked: false },
    { id: "2", type: "overlay", label: "Оверлей фона", visible: true, locked: false },
  ]);

  const handleGenerateText = async () => {
    if (!textTopic.trim()) return;
    setTextLoading(true); setTextError(""); setGeneratedText("");
    try {
      const res = await fetch(API_TEXT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: textTopic, type: textType, style: textStyle }),
      });
      const data = await res.json();
      if (!res.ok) { setTextError(data.error || "Ошибка генерации"); return; }
      setGeneratedText(data.text);
    } catch (e: any) {
      setTextError(e.message || "Сетевая ошибка");
    } finally {
      setTextLoading(false);
    }
  };

  const handleAudioFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioFile(file);
    setAudioUrl(URL.createObjectURL(file));
  };

  const addLayer = (type: typeof LAYER_TYPES[0]) => {
    const newLayer: Layer = {
      id: crypto.randomUUID(),
      type: type.id,
      label: `${type.label} ${layers.filter(l => l.type === type.id).length + 1}`,
      visible: true,
      locked: false,
    };
    setLayers(prev => [newLayer, ...prev]);
    onAddLayer(newLayer);
  };

  const toggleLayerProp = (id: string, prop: "visible" | "locked") => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, [prop]: !l[prop] } : l));
  };

  const removeLayer = (id: string) => setLayers(prev => prev.filter(l => l.id !== id));

  if (!open || !tool) return null;

  const panelTitles: Record<NonNullable<ToolType>, string> = {
    style: "Стиль видео", color: "Цветовая палитра", sound: "Звук и музыка",
    text: "ИИ-генератор текста", layers: "Слои", filters: "Фильтры",
  };

  const SF = { fontFamily: "'Syne', sans-serif" };

  return (
    <div className="fixed inset-0 z-40 flex" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      {/* Panel slides in from right */}
      <div
        className="absolute right-0 top-0 bottom-0 w-[380px] bg-[hsl(220_14%_9%)] border-l border-white/8 flex flex-col shadow-2xl animate-slide-in-right"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
              <Icon name={tool === "style" ? "Wand2" : tool === "color" ? "Palette" : tool === "sound" ? "Music" : tool === "text" ? "Type" : tool === "layers" ? "Layers" : "Sliders"} size={14} className="text-amber-400" />
            </div>
            <span className="font-bold text-white/90 text-sm" style={SF}>{panelTitles[tool]}</span>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-white/5 flex items-center justify-center transition-colors">
            <Icon name="X" size={15} className="text-white/40" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 flex flex-col gap-5">

          {/* ── STYLE ── */}
          {tool === "style" && (
            <>
              <div>
                <p className="text-xs text-white/30 mb-3">Готовые стили</p>
                <div className="grid grid-cols-2 gap-2">
                  {PRESET_STYLES.map(s => (
                    <button key={s.id} onClick={() => onApplyStyle(s.id)}
                      className="flex items-start gap-2.5 p-3 rounded-xl border border-white/5 hover:border-amber-500/30 bg-white/2 hover:bg-amber-500/5 transition-all text-left group">
                      <span className="text-lg mt-0.5 shrink-0">{s.emoji}</span>
                      <div>
                        <div className="text-xs font-semibold text-white/70 group-hover:text-white transition-colors" style={SF}>{s.label}</div>
                        <div className="text-[10px] text-white/25 mt-0.5 leading-tight">{s.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="border-t border-white/5 pt-4">
                <p className="text-xs text-white/30 mb-2">Свой стиль</p>
                <textarea
                  value={customStyle}
                  onChange={e => setCustomStyle(e.target.value)}
                  placeholder="Опишите желаемый стиль... Например: «Тёмная атмосфера, синие неоновые блики, туман»"
                  className="w-full bg-white/5 rounded-xl p-3 text-sm text-white/70 placeholder:text-white/20 resize-none border border-white/5 focus:outline-none focus:border-amber-500/30 transition-colors h-24 scrollbar-thin"
                />
                <button
                  disabled={!customStyle.trim()}
                  onClick={() => { onApplyStyle("custom:" + customStyle); setCustomStyle(""); }}
                  className="w-full mt-2 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-black font-bold text-sm transition-all active:scale-95" style={SF}>
                  Применить стиль
                </button>
              </div>
            </>
          )}

          {/* ── COLOR ── */}
          {tool === "color" && (
            <>
              <div>
                <p className="text-xs text-white/30 mb-3">Палитра цветов</p>
                <div className="grid grid-cols-8 gap-1.5">
                  {COLOR_PALETTE.map(c => (
                    <button key={c} onClick={() => onApplyColor(c)}
                      className="w-full aspect-square rounded-lg border border-white/10 hover:scale-110 hover:border-white/40 transition-all"
                      style={{ background: c }} title={c} />
                  ))}
                </div>
              </div>
              <div className="border-t border-white/5 pt-4">
                <p className="text-xs text-white/30 mb-2">Свой цвет</p>
                <div className="flex gap-3 items-center">
                  <input type="color" value={customColor} onChange={e => setCustomColor(e.target.value)}
                    className="w-12 h-12 rounded-xl cursor-pointer border-2 border-white/10 bg-transparent" />
                  <div className="flex-1">
                    <input type="text" value={customColor} onChange={e => setCustomColor(e.target.value)}
                      className="w-full bg-white/5 rounded-lg px-3 py-2 text-sm text-white/70 font-mono border border-white/5 focus:outline-none focus:border-amber-500/30 transition-colors" />
                  </div>
                  <button onClick={() => onApplyColor(customColor)}
                    className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-all" style={SF}>
                    ОК
                  </button>
                </div>
              </div>
              {/* Color gradients */}
              <div className="border-t border-white/5 pt-4">
                <p className="text-xs text-white/30 mb-3">Градиенты</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    "linear-gradient(135deg,#ff6b35,#f7c59f)",
                    "linear-gradient(135deg,#5352ed,#c44dff)",
                    "linear-gradient(135deg,#00c3a0,#2196f3)",
                    "linear-gradient(135deg,#ff4757,#ff6d00)",
                    "linear-gradient(135deg,#212121,#546e7a)",
                    "linear-gradient(135deg,#fff9c4,#ff9100)",
                  ].map((g, i) => (
                    <button key={i} onClick={() => onApplyColor(g)}
                      className="h-10 rounded-lg border border-white/10 hover:scale-[1.03] hover:border-white/30 transition-all"
                      style={{ background: g }} />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── SOUND ── */}
          {tool === "sound" && (
            <>
              <div>
                <p className="text-xs text-white/30 mb-3">Загрузить музыку или звук</p>
                <div
                  onClick={() => audioInputRef.current?.click()}
                  className="border-2 border-dashed border-white/10 hover:border-amber-500/40 rounded-xl p-6 flex flex-col items-center gap-3 cursor-pointer transition-all group">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/20 transition-all">
                    <Icon name="Upload" size={22} className="text-amber-400" />
                  </div>
                  <div className="text-center">
                    <div className="text-sm text-white/50 font-medium" style={SF}>Нажмите или перетащите файл</div>
                    <div className="text-xs text-white/20 mt-1">MP3, WAV, AAC, OGG · до 50 МБ</div>
                  </div>
                </div>
                <input ref={audioInputRef} type="file" accept="audio/*" onChange={handleAudioFile} className="hidden" />
              </div>

              {audioFile && audioUrl && (
                <div className="glass rounded-xl p-4 flex flex-col gap-3 animate-fade-in">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                      <Icon name="Music" size={16} className="text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white/80 truncate" style={SF}>{audioFile.name}</div>
                      <div className="text-xs text-white/30">{(audioFile.size / 1024 / 1024).toFixed(1)} МБ</div>
                    </div>
                    <button onClick={() => { setAudioFile(null); setAudioUrl(""); }}
                      className="w-7 h-7 rounded-lg hover:bg-red-500/10 flex items-center justify-center transition-colors">
                      <Icon name="Trash2" size={13} className="text-white/30 hover:text-red-400" />
                    </button>
                  </div>
                  <audio src={audioUrl} controls className="w-full h-8 rounded-lg" />
                  <button onClick={() => onApplyColor("sound:" + audioFile.name)}
                    className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all active:scale-95" style={SF}>
                    Добавить в видео
                  </button>
                </div>
              )}

              <div className="border-t border-white/5 pt-4">
                <p className="text-xs text-white/30 mb-3">Встроенные звуки</p>
                <div className="flex flex-col gap-2">
                  {[
                    { name: "Атмосферный фон", dur: "2:30", icon: "Wind" },
                    { name: "Эпический оркестр", dur: "1:45", icon: "Music2" },
                    { name: "Электронный бит", dur: "0:58", icon: "Zap" },
                    { name: "Кинематографичный дрон", dur: "3:12", icon: "Radio" },
                    { name: "Тишина (без звука)", dur: "—", icon: "VolumeX" },
                  ].map(s => (
                    <div key={s.name} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/3 border border-transparent hover:border-white/5 group cursor-pointer transition-all">
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                        <Icon name={s.icon as any} size={14} className="text-white/30 group-hover:text-amber-400 transition-colors" />
                      </div>
                      <span className="flex-1 text-sm text-white/50 group-hover:text-white/80 transition-colors">{s.name}</span>
                      <span className="text-xs text-white/20 font-mono">{s.dur}</span>
                      <Icon name="Plus" size={13} className="text-white/20 group-hover:text-amber-400 opacity-0 group-hover:opacity-100 transition-all" />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── TEXT ── */}
          {tool === "text" && (
            <>
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-xs text-white/30 mb-2">Тема / о чём видео</p>
                  <textarea
                    value={textTopic}
                    onChange={e => setTextTopic(e.target.value)}
                    placeholder="Например: «Рекламный ролик спортивных кроссовок Nike»"
                    className="w-full bg-white/5 rounded-xl p-3 text-sm text-white/70 placeholder:text-white/20 resize-none border border-white/5 focus:outline-none focus:border-amber-500/30 transition-colors h-20 scrollbar-thin"
                  />
                </div>
                <div>
                  <p className="text-xs text-white/30 mb-2">Тип текста</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {["заголовок","подзаголовок","слоган","описание","субтитры","призыв к действию"].map(t => (
                      <button key={t} onClick={() => setTextType(t)}
                        className={`py-1.5 rounded-lg text-[11px] font-medium border transition-all ${textType === t ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "border-white/5 text-white/30 hover:border-white/15 hover:text-white/60"}`} style={SF}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-white/30 mb-2">Стиль</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {["нейтральный","динамичный","эмоциональный","минималистичный","дерзкий"].map(s => (
                      <button key={s} onClick={() => setTextStyle(s)}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-all ${textStyle === s ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "border-white/5 text-white/30 hover:border-white/15"}`} style={SF}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={handleGenerateText} disabled={!textTopic.trim() || textLoading}
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-black font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2" style={SF}>
                  {textLoading ? <><Icon name="Loader2" size={14} className="animate-spin" />Генерирую...</> : "✦ Сгенерировать текст"}
                </button>
              </div>

              {textError && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400 flex items-center gap-2 animate-fade-in">
                  <Icon name="AlertCircle" size={13} /> {textError}
                </div>
              )}

              {generatedText && (
                <div className="glass rounded-xl p-4 flex flex-col gap-3 animate-fade-in border border-amber-500/20">
                  <div className="flex items-center gap-2 text-xs text-amber-400">
                    <Icon name="Sparkles" size={12} /> Результат
                  </div>
                  <p className="text-sm text-white/80 leading-relaxed">{generatedText}</p>
                  <div className="flex gap-2">
                    <button onClick={() => { onApplyText(generatedText); onClose(); }}
                      className="flex-1 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all" style={SF}>
                      Добавить в видео
                    </button>
                    <button onClick={() => navigator.clipboard.writeText(generatedText)}
                      className="px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 text-xs text-white/40 hover:text-white/70 transition-all flex items-center gap-1.5">
                      <Icon name="Copy" size={12} /> Копировать
                    </button>
                    <button onClick={handleGenerateText}
                      className="px-3 py-1.5 rounded-lg border border-white/10 hover:border-amber-500/30 text-xs text-white/40 hover:text-amber-400 transition-all">
                      <Icon name="RefreshCw" size={12} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── LAYERS ── */}
          {tool === "layers" && (
            <>
              <div>
                <p className="text-xs text-white/30 mb-3">Добавить слой</p>
                <div className="grid grid-cols-3 gap-2">
                  {LAYER_TYPES.map(lt => (
                    <button key={lt.id} onClick={() => addLayer(lt)}
                      className="flex flex-col items-center gap-2 py-3 rounded-xl border border-white/5 hover:border-amber-500/30 bg-white/2 hover:bg-amber-500/5 transition-all group">
                      <Icon name={lt.icon as any} size={18} className={`${lt.color} opacity-60 group-hover:opacity-100 transition-opacity`} />
                      <span className="text-[10px] text-white/30 group-hover:text-white/70 transition-colors" style={SF}>{lt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="border-t border-white/5 pt-4">
                <p className="text-xs text-white/30 mb-3">Активные слои ({layers.length})</p>
                <div className="flex flex-col gap-2">
                  {layers.length === 0 && (
                    <div className="text-center py-6 text-xs text-white/20">Слоев нет — добавьте выше</div>
                  )}
                  {layers.map((layer, i) => {
                    const lt = LAYER_TYPES.find(l => l.id === layer.type);
                    return (
                      <div key={layer.id}
                        className="flex items-center gap-3 p-2.5 rounded-lg border border-white/5 hover:border-white/10 transition-all group bg-white/2">
                        <span className="text-xs text-white/20 font-mono w-4">{i + 1}</span>
                        <Icon name={lt?.icon as any || "Square"} size={13} className={lt?.color || "text-white/30"} />
                        <span className="flex-1 text-xs text-white/60 truncate" style={SF}>{layer.label}</span>
                        <button onClick={() => toggleLayerProp(layer.id, "visible")}
                          className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/5 transition-colors">
                          <Icon name={layer.visible ? "Eye" : "EyeOff"} size={12} className={layer.visible ? "text-white/40" : "text-white/15"} />
                        </button>
                        <button onClick={() => toggleLayerProp(layer.id, "locked")}
                          className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/5 transition-colors">
                          <Icon name={layer.locked ? "Lock" : "Unlock"} size={12} className={layer.locked ? "text-amber-400" : "text-white/20"} />
                        </button>
                        <button onClick={() => removeLayer(layer.id)}
                          className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100">
                          <Icon name="Trash2" size={12} className="text-red-400/60" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* ── FILTERS ── */}
          {tool === "filters" && (
            <>
              <p className="text-xs text-white/30">Выберите фильтр для применения к видео</p>
              <div className="grid grid-cols-3 gap-3">
                {VIDEO_FILTERS.map(f => (
                  <button key={f.id} onClick={() => onApplyFilter(f.id)}
                    className="flex flex-col gap-2 group transition-all hover:scale-[1.03]">
                    <div className={`w-full aspect-video rounded-lg ${f.preview} border border-white/10 group-hover:border-amber-500/40 transition-all overflow-hidden relative`}>
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-6 h-6 rounded-full bg-amber-500/80 flex items-center justify-center">
                          <Icon name="Check" size={12} className="text-black" />
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] text-white/40 group-hover:text-amber-400 transition-colors text-center" style={SF}>{f.label}</span>
                  </button>
                ))}
              </div>
              <div className="border-t border-white/5 pt-4">
                <p className="text-xs text-white/30 mb-3">Параметры коррекции</p>
                {[
                  { label: "Яркость", val: 50 },
                  { label: "Контраст", val: 50 },
                  { label: "Насыщенность", val: 50 },
                  { label: "Резкость", val: 30 },
                ].map(p => (
                  <div key={p.label} className="flex items-center gap-3 mb-3">
                    <span className="text-xs text-white/30 w-24 shrink-0">{p.label}</span>
                    <input type="range" min={0} max={100} defaultValue={p.val}
                      className="flex-1 accent-amber-500 cursor-pointer" />
                    <span className="text-xs font-mono text-amber-400/60 w-8 text-right">{p.val}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pb-4 pt-2 border-t border-white/5 shrink-0">
          <button onClick={onClose}
            className="w-full py-2 rounded-xl border border-white/10 text-xs text-white/40 hover:text-white/70 hover:border-white/20 transition-all" style={SF}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

interface EditorState {
  clip: GeneratedClip | null;
  appliedStyle: string | null;
  appliedColor: string | null;
  appliedFilter: string | null;
  appliedTexts: string[];
}

function EditorSection({
  onSaveProject,
  editorState,
  onEditorStateChange,
}: {
  onSaveProject: (p: SavedProject) => void;
  editorState: EditorState;
  onEditorStateChange: (s: Partial<EditorState>) => void;
}) {
  const { clip, appliedStyle, appliedColor, appliedFilter, appliedTexts } = editorState;
  const setClip = (c: GeneratedClip | null) => onEditorStateChange({ clip: c });
  const setAppliedStyle = (s: string | null) => onEditorStateChange({ appliedStyle: s });
  const setAppliedColor = (c: string | null) => onEditorStateChange({ appliedColor: c });
  const setAppliedFilter = (f: string | null) => onEditorStateChange({ appliedFilter: f });
  const setAppliedTexts = (fn: ((prev: string[]) => string[]) | string[]) =>
    onEditorStateChange({ appliedTexts: typeof fn === "function" ? fn(appliedTexts) : fn });

  const [aiPrompt, setAiPrompt] = useState("");
  const [duration, setDuration] = useState(10);
  const [genStatus, setGenStatus] = useState<GenStatus>("idle");
  const [genProgress, setGenProgress] = useState(0);
  const [genError, setGenError] = useState("");
  const [playhead, setPlayhead] = useState(33);
  const [isPlaying, setIsPlaying] = useState(false);
  const [saved, setSaved] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolType>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const handleSave = () => {
    if (!clip) return;
    const name = projectName.trim() || `Сцена: ${clip.prompt.slice(0, 40)}`;
    const project: SavedProject = {
      id: crypto.randomUUID(),
      name,
      prompt: clip.prompt,
      videoUrl: clip.videoUrl,
      duration: clip.duration,
      savedAt: new Date().toISOString(),
    };
    onSaveProject(project);
    setSaved(true);
    setShowSaveModal(false);
  };

  const pollStatus = useCallback((taskId: string) => {
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 120) { stopPolling(); setGenStatus("error"); setGenError("Превышено время ожидания (10 мин)"); return; }
      try {
        const res = await fetch(`${API_CHECK}?taskId=${taskId}`);
        const data = await res.json();
        const { status, videoUrl, progress } = data;
        if (progress != null) setGenProgress(Math.round(progress * 100));
        if (status === "SUCCEEDED" && videoUrl) {
          stopPolling();
          setGenProgress(100);
          setGenStatus("done");
          setClip({ videoUrl, prompt: aiPrompt, duration });
        } else if (status === "FAILED") {
          stopPolling();
          setGenStatus("error");
          setGenError(data.error || "Генерация завершилась с ошибкой");
        } else {
          setGenStatus("running");
        }
      } catch {
        /* ignore network errors, keep polling */
      }
    }, 5000);
  }, [aiPrompt, duration, stopPolling]);

  const handleGenerate = async () => {
    if (!aiPrompt.trim() || genStatus === "pending" || genStatus === "running") return;
    setGenStatus("pending");
    setGenProgress(0);
    setGenError("");
    setClip(null);
    try {
      const res = await fetch(API_GENERATE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt, duration }),
      });
      const data = await res.json();
      if (!res.ok) { setGenStatus("error"); setGenError(data.error || "Ошибка запуска"); return; }
      setGenStatus("running");
      pollStatus(data.taskId);
    } catch (e: any) {
      setGenStatus("error");
      setGenError(e.message || "Сетевая ошибка");
    }
  };

  const isGenerating = genStatus === "pending" || genStatus === "running";
  const statusLabel = genStatus === "pending" ? "Запуск задачи..." : genStatus === "running" ? `Генерирую видео... ${genProgress}%` : "";

  return (
    <div className="flex flex-col h-full gap-4 animate-fade-in">
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Video Preview */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          <div className="relative rounded-xl overflow-hidden bg-black border border-white/5 aspect-video flex items-center justify-center group" style={{ minHeight: 240 }}>
            {clip ? (
              <video
                ref={videoRef}
                src={clip.videoUrl}
                className="absolute inset-0 w-full h-full object-cover animate-scale-in"
                controls={false}
                loop
                onClick={() => {
                  if (videoRef.current) {
                    if (isPlaying) { videoRef.current.pause(); } else { void videoRef.current.play(); }
                    setIsPlaying(!isPlaying);
                  }
                }}
              />
            ) : (
              <>
                <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black" />
                <div className="relative z-10 flex flex-col items-center gap-3 opacity-40 group-hover:opacity-60 transition-opacity">
                  <Icon name="Play" size={48} className="text-white/30" />
                  <span className="text-xs text-white/30 tracking-widest uppercase" style={{ fontFamily: "'Syne', sans-serif" }}>Предпросмотр</span>
                </div>
              </>
            )}
            {/* Progress overlay during generation */}
            {isGenerating && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 z-20">
                <div className="absolute top-0 h-full w-1 bg-amber-400/60 blur-sm animate-scan" />
                <div className="flex flex-col items-center gap-3 relative z-10">
                  <Icon name="Loader2" size={32} className="text-amber-400 animate-spin" />
                  <span className="text-sm text-amber-300 font-semibold" style={{ fontFamily: "'Syne', sans-serif" }}>{statusLabel}</span>
                  <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full transition-all duration-500" style={{ width: `${genProgress || 5}%` }} />
                  </div>
                  <span className="text-xs text-white/30">Runway ML Gen-3 · {duration} сек</span>
                </div>
              </div>
            )}
            {/* Play overlay for ready video */}
            {clip && !isGenerating && (
              <button
                onClick={() => {
                  if (videoRef.current) {
                    if (isPlaying) { videoRef.current.pause(); } else { void videoRef.current.play(); }
                    setIsPlaying(!isPlaying);
                  }
                }}
                className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-black/20"
              >
                <div className="w-14 h-14 rounded-full bg-amber-500/80 flex items-center justify-center">
                  <Icon name={isPlaying ? "Pause" : "Play"} size={22} className="text-black" />
                </div>
              </button>
            )}
            <div className="absolute bottom-3 right-3 bg-black/60 px-2 py-0.5 rounded text-xs font-mono text-amber-400/80 z-10">
              00:{String(Math.floor(playhead / 10)).padStart(2, '0')}:{String((playhead * 3) % 60).padStart(2, '0')}
            </div>
            {clip && (
              <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-500/30 rounded-lg px-2 py-1 z-10">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-[10px] text-emerald-400">Runway Gen-3 · {clip.duration}с</span>
              </div>
            )}
          </div>

          {/* Transport */}
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {["SkipBack","Rewind","Play","FastForward","SkipForward"].map(icon => (
                <button key={icon} className="w-8 h-8 rounded-lg bg-[hsl(var(--surface-2))] hover:bg-[hsl(var(--surface-3))] border border-white/5 flex items-center justify-center transition-all hover:border-amber-500/20">
                  <Icon name={icon as any} size={14} className="text-white/60" />
                </button>
              ))}
            </div>
            <div className="flex-1 relative h-1.5 bg-white/5 rounded-full cursor-pointer" onClick={e => {
              const r = e.currentTarget.getBoundingClientRect();
              setPlayhead(Math.round(((e.clientX - r.left) / r.width) * 100));
            }}>
              <div className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full transition-all" style={{ width: `${playhead}%` }} />
              <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-amber-400 border-2 border-black shadow-lg transition-all" style={{ left: `calc(${playhead}% - 6px)` }} />
            </div>
            <span className="text-xs font-mono text-white/30">02:14 / 06:30</span>
          </div>
        </div>

        {/* AI Panel */}
        <div className="w-72 flex flex-col gap-3">
          <div className="glass rounded-xl p-4 flex flex-col gap-3 flex-1">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Icon name="Sparkles" size={13} className="text-amber-400" />
              </div>
              <span className="text-xs font-semibold tracking-wide text-white/80 uppercase" style={{ fontFamily: "'Syne', sans-serif" }}>ИИ-Генератор</span>
              <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400/70 border border-amber-500/15">Runway Gen-3</span>
            </div>
            <textarea
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              placeholder="Опишите сцену... Например: «Космический корабль пролетает над тёмной планетой, лучи света разрезают туман»"
              className="flex-1 bg-white/5 rounded-lg p-3 text-sm text-white/70 placeholder:text-white/20 resize-none border border-white/5 focus:outline-none focus:border-amber-500/30 transition-colors min-h-[90px] scrollbar-thin"
              disabled={isGenerating}
            />
            {/* Duration picker */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-white/30">Длительность</span>
                <span className="text-[10px] font-mono font-bold text-amber-400">{duration} сек</span>
              </div>
              <div className="flex gap-1.5">
                {[5, 10, 15, 20, 30].map(d => (
                  <button key={d} onClick={() => setDuration(d)} disabled={isGenerating}
                    className={`flex-1 py-1 rounded-lg text-[11px] font-semibold border transition-all disabled:opacity-40 ${duration === d ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "border-white/5 text-white/30 hover:border-white/15 hover:text-white/50"}`}
                    style={{ fontFamily: "'Syne', sans-serif" }}>
                    {d}с
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {["Кино-нуар", "Sci-Fi", "Рассвет", "Слоу-мо"].map(tag => (
                <button key={tag} onClick={() => setAiPrompt(prev => prev + (prev ? ", " : "") + tag.toLowerCase())}
                  disabled={isGenerating}
                  className="px-2.5 py-1 rounded-full text-xs bg-white/5 hover:bg-amber-500/10 border border-white/5 hover:border-amber-500/20 text-white/40 hover:text-amber-300 transition-all disabled:opacity-40">
                  {tag}
                </button>
              ))}
            </div>
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !aiPrompt.trim()}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-30 disabled:cursor-not-allowed text-black font-bold text-sm tracking-wide transition-all active:scale-95"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              {isGenerating ? (
                <span className="flex items-center justify-center gap-2">
                  <Icon name="Loader2" size={14} className="animate-spin" />
                  {statusLabel}
                </span>
              ) : "✦ Генерировать сцену"}
            </button>
            {/* Progress bar during generation */}
            {isGenerating && (
              <div className="flex flex-col gap-1 animate-fade-in">
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full transition-all duration-500"
                    style={{ width: `${genProgress || 5}%` }} />
                </div>
                <span className="text-[10px] text-white/20 text-center">Обычно занимает 1–3 минуты</span>
              </div>
            )}
            {genStatus === "done" && clip && (
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 flex flex-col gap-2 animate-fade-in">
                <div className="flex items-center gap-2 text-xs text-emerald-400">
                  <Icon name="CheckCircle2" size={13} />
                  <span>Видео готово!</span>
                </div>
                {saved ? (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400/70">
                    <Icon name="BookmarkCheck" size={12} />
                    Сохранено в проекты
                  </div>
                ) : showSaveModal ? (
                  <div className="flex flex-col gap-2 animate-fade-in">
                    <input
                      value={projectName}
                      onChange={e => setProjectName(e.target.value)}
                      placeholder={`Сцена: ${clip.prompt.slice(0, 30)}...`}
                      className="w-full bg-white/5 rounded-lg px-3 py-2 text-xs text-white/70 placeholder:text-white/20 border border-white/10 focus:outline-none focus:border-emerald-500/40 transition-colors"
                      onKeyDown={e => e.key === "Enter" && handleSave()}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button onClick={handleSave}
                        className="flex-1 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-all active:scale-95"
                        style={{ fontFamily: "'Syne', sans-serif" }}>
                        Сохранить
                      </button>
                      <button onClick={() => setShowSaveModal(false)}
                        className="px-3 py-1.5 rounded-lg border border-white/10 text-xs text-white/30 hover:text-white/50 transition-all">
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => setShowSaveModal(true)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-xs text-emerald-400 font-semibold transition-all"
                      style={{ fontFamily: "'Syne', sans-serif" }}>
                      <Icon name="Bookmark" size={12} />
                      В проекты
                    </button>
                    <a href={clip.videoUrl} target="_blank" rel="noreferrer"
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/8 border border-white/10 text-xs text-white/50 transition-all">
                      <Icon name="Download" size={12} />
                      Скачать
                    </a>
                  </div>
                )}
              </div>
            )}
            {genStatus === "error" && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400 flex items-start gap-2 animate-fade-in">
                <Icon name="AlertCircle" size={13} className="shrink-0 mt-0.5" />
                <span>{genError}</span>
              </div>
            )}
          </div>

          <div className="glass rounded-xl p-3 grid grid-cols-3 gap-2">
            {([
              { icon: "Wand2",    label: "Стиль",    tool: "style"   as ToolType, badge: appliedStyle   },
              { icon: "Palette",  label: "Цвет",     tool: "color"   as ToolType, badge: appliedColor   },
              { icon: "Music",    label: "Звук",     tool: "sound"   as ToolType, badge: null           },
              { icon: "Type",     label: "Текст",    tool: "text"    as ToolType, badge: appliedTexts.length > 0 ? String(appliedTexts.length) : null },
              { icon: "Layers",   label: "Слои",     tool: "layers"  as ToolType, badge: null           },
              { icon: "Sliders",  label: "Фильтры",  tool: "filters" as ToolType, badge: appliedFilter  },
            ] as const).map(({ icon, label, tool, badge }) => (
              <button key={icon} onClick={() => setActiveTool(tool)}
                className={`relative flex flex-col items-center gap-1 py-2 px-1 rounded-lg border transition-all group
                  ${activeTool === tool ? "bg-amber-500/15 border-amber-500/30 text-amber-400" : "bg-white/[0.02] hover:bg-amber-500/10 border-white/5 hover:border-amber-500/20 text-white/40 hover:text-amber-400"}`}>
                <Icon name={icon as any} size={15} className="transition-colors" />
                <span className="text-[10px] transition-colors">{label}</span>
                {badge && (
                  <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-500 flex items-center justify-center">
                    <span className="text-[8px] font-bold text-black">{typeof badge === "string" && badge.length <= 2 ? badge : "✓"}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tools side panel */}
      <ToolsPanel
        open={activeTool !== null}
        tool={activeTool}
        onClose={() => setActiveTool(null)}
        onApplyStyle={s => { setAppliedStyle(s); setActiveTool(null); }}
        onApplyColor={c => { setAppliedColor(c); setActiveTool(null); }}
        onApplyFilter={f => { setAppliedFilter(f); setActiveTool(null); }}
        onAddLayer={() => {}}
        onApplyText={t => { setAppliedTexts(prev => [...prev, t]); setActiveTool(null); }}
      />

      {/* Timeline */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
          <span className="text-xs font-semibold text-white/50 uppercase tracking-widest" style={{ fontFamily: "'Syne', sans-serif" }}>Таймлайн</span>
          <div className="flex gap-1.5">
            {["ZoomIn","ZoomOut","Scissors","Copy","Trash2"].map(icon => (
              <button key={icon} className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/5 transition-colors">
                <Icon name={icon as any} size={12} className="text-white/30 hover:text-white/60" />
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <div className="min-w-[600px]">
            <div className="flex ml-20 h-5 border-b border-white/5" style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 79px, rgba(255,255,255,0.04) 79px, rgba(255,255,255,0.04) 80px)" }}>
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="w-20 flex items-center">
                  <span className="text-[9px] text-white/20 font-mono pl-1">0:{String(i * 6).padStart(2, '0')}</span>
                </div>
              ))}
            </div>
            {TIMELINE_TRACKS.map((track, ti) => (
              <div key={ti} className="flex items-center h-9 border-b border-white/5 group hover:bg-white/[0.01]">
                <div className="w-20 px-3 flex items-center gap-1.5 shrink-0">
                  <div className={`w-2 h-2 rounded-full ${track.color} opacity-70`} />
                  <span className="text-[10px] text-white/30 group-hover:text-white/50 transition-colors truncate">{track.label}</span>
                </div>
                <div className="flex-1 relative h-full" style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 79px, rgba(255,255,255,0.03) 79px, rgba(255,255,255,0.03) 80px)" }}>
                  {track.clips.map((clip, ci) => (
                    <div key={ci}
                      className={`absolute top-1.5 bottom-1.5 rounded-md ${track.color} opacity-60 hover:opacity-80 cursor-pointer transition-opacity border border-white/10`}
                      style={{ left: clip.offset, width: clip.w }}
                    />
                  ))}
                  <div className="absolute top-0 bottom-0 w-px bg-amber-400/70" style={{ left: `${playhead * 3.6}px` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LibrarySection() {
  const [tab, setTab] = useState<"templates"|"effects"|"scenes">("templates");
  return (
    <div className="flex flex-col h-full gap-5 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-white" style={{ fontFamily: "'Syne', sans-serif" }}>Библиотека</h2>
        <p className="text-sm text-white/30 mt-1">Шаблоны, эффекты и готовые сцены для ваших проектов</p>
      </div>
      <div className="flex gap-1 p-1 bg-white/5 rounded-xl w-fit">
        {(["templates","effects","scenes"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab===t ? "bg-amber-500 text-black" : "text-white/40 hover:text-white/70"}`}
            style={{ fontFamily: "'Syne', sans-serif" }}>
            {t === "templates" ? "Шаблоны" : t === "effects" ? "Эффекты" : "Сцены"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4 overflow-y-auto scrollbar-thin pr-1">
        {TEMPLATES.map((tmpl, i) => (
          <div key={i} className={`relative rounded-xl overflow-hidden bg-gradient-to-br ${tmpl.color} border border-white/5 hover:border-amber-500/30 group cursor-pointer transition-all hover:scale-[1.02] animate-fade-in`}
            style={{ animationDelay: `${i * 0.07}s`, animationFillMode: "both" }}>
            <div className="aspect-video flex items-center justify-center">
              <Icon name="Play" size={28} className="text-white/20 group-hover:text-white/60 transition-colors" />
            </div>
            <div className="p-3 border-t border-white/5">
              <div className="font-semibold text-sm text-white/80" style={{ fontFamily: "'Syne', sans-serif" }}>{tmpl.name}</div>
              <div className="flex gap-1.5 mt-1.5">
                {tmpl.tags.map(tag => (
                  <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">{tag}</span>
                ))}
              </div>
            </div>
            <button className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/40 hover:bg-amber-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
              <Icon name="Plus" size={13} className="text-white" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectsSection({
  projects,
  onDelete,
  onGoToEditor,
}: {
  projects: SavedProject[];
  onDelete: (id: string) => void;
  onGoToEditor: () => void;
}) {
  const [preview, setPreview] = useState<SavedProject | null>(null);

  return (
    <div className="flex flex-col h-full gap-5 animate-fade-in">
      {/* Video preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setPreview(null)}>
          <div className="relative w-full max-w-2xl mx-4 rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <video src={preview.videoUrl} controls autoPlay loop className="w-full aspect-video bg-black" />
            <div className="p-4 bg-[hsl(var(--surface-1))] flex items-center justify-between">
              <div>
                <div className="font-semibold text-white/90 text-sm" style={{ fontFamily: "'Syne', sans-serif" }}>{preview.name}</div>
                <div className="text-xs text-white/30 mt-0.5 line-clamp-1">{preview.prompt}</div>
              </div>
              <div className="flex gap-2">
                <a href={preview.videoUrl} target="_blank" rel="noreferrer" download
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all"
                  style={{ fontFamily: "'Syne', sans-serif" }}>
                  <Icon name="Download" size={13} />
                  Скачать
                </a>
                <button onClick={() => setPreview(null)}
                  className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center transition-colors">
                  <Icon name="X" size={15} className="text-white/50" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white" style={{ fontFamily: "'Syne', sans-serif" }}>Мои проекты</h2>
          <p className="text-sm text-white/30 mt-1">
            Сгенерированные видео · {projects.length} {projects.length === 1 ? "проект" : projects.length < 5 ? "проекта" : "проектов"}
          </p>
        </div>
        <button onClick={onGoToEditor}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all active:scale-95"
          style={{ fontFamily: "'Syne', sans-serif" }}>
          <Icon name="Plus" size={15} />
          Новая сцена
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-white/3 border border-white/5 flex items-center justify-center">
            <Icon name="Clapperboard" size={28} className="text-white/15" />
          </div>
          <div>
            <div className="font-semibold text-white/40 text-sm" style={{ fontFamily: "'Syne', sans-serif" }}>Проектов пока нет</div>
            <div className="text-xs text-white/20 mt-1">Сгенерируйте первую сцену в редакторе</div>
          </div>
          <button onClick={onGoToEditor}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-amber-500/30 text-amber-400 text-sm hover:bg-amber-500/10 transition-all"
            style={{ fontFamily: "'Syne', sans-serif" }}>
            <Icon name="Sparkles" size={15} />
            Открыть редактор
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 overflow-y-auto scrollbar-thin pr-1">
          {projects.map((proj, i) => (
            <div key={proj.id}
              className="glass rounded-xl p-4 flex items-center gap-4 hover:border-amber-500/20 transition-all group cursor-pointer animate-fade-in"
              style={{ animationDelay: `${i * 0.06}s`, animationFillMode: "both" }}
              onClick={() => setPreview(proj)}>
              {/* Thumbnail / play icon */}
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-gradient-to-br from-amber-900/40 to-zinc-900 border border-white/5 flex items-center justify-center shrink-0 relative">
                <video src={proj.videoUrl} className="absolute inset-0 w-full h-full object-cover opacity-70" muted playsInline preload="metadata" />
                <div className="relative z-10 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Icon name="Play" size={11} className="text-white" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white/80 group-hover:text-white transition-colors truncate"
                  style={{ fontFamily: "'Syne', sans-serif" }}>{proj.name}</div>
                <div className="text-xs text-white/25 mt-0.5 truncate">{proj.prompt}</div>
                <div className="text-xs text-white/20 mt-0.5">{formatDate(proj.savedAt)} · {proj.duration} сек · Runway Gen-3</div>
              </div>
              <div className="px-2.5 py-1 rounded-full text-xs font-medium border bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shrink-0">
                Готов
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                <a href={proj.videoUrl} target="_blank" rel="noreferrer" download
                  className="w-7 h-7 rounded-lg hover:bg-white/5 flex items-center justify-center transition-colors">
                  <Icon name="Download" size={14} className="text-white/30 hover:text-amber-400" />
                </a>
                <button onClick={() => onDelete(proj.id)}
                  className="w-7 h-7 rounded-lg hover:bg-red-500/10 flex items-center justify-center transition-colors">
                  <Icon name="Trash2" size={14} className="text-white/30 hover:text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsSection() {
  const [aiModel, setAiModel] = useState(0);
  const [quality, setQuality] = useState(80);

  return (
    <div className="flex flex-col h-full gap-5 overflow-y-auto scrollbar-thin pr-1 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-white" style={{ fontFamily: "'Syne', sans-serif" }}>Настройки</h2>
        <p className="text-sm text-white/30 mt-1">Профиль, параметры ИИ и конфигурация</p>
      </div>
      <div className="glass rounded-xl p-5">
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4" style={{ fontFamily: "'Syne', sans-serif" }}>Профиль</h3>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center font-bold text-xl text-black" style={{ fontFamily: "'Syne', sans-serif" }}>A</div>
          <div>
            <div className="font-semibold text-white" style={{ fontFamily: "'Syne', sans-serif" }}>Алексей Новиков</div>
            <div className="text-sm text-white/30">Pro-план · 240 кредитов ИИ</div>
          </div>
          <button className="ml-auto px-3 py-1.5 rounded-lg border border-white/10 text-xs text-white/40 hover:border-amber-500/30 hover:text-amber-400 transition-all">Редактировать</button>
        </div>
      </div>
      <div className="glass rounded-xl p-5">
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4" style={{ fontFamily: "'Syne', sans-serif" }}>Модель ИИ</h3>
        <div className="flex flex-col gap-2">
          {AI_MODELS.map((m, i) => (
            <button key={i} onClick={() => setAiModel(i)}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${aiModel===i ? "border-amber-500/40 bg-amber-500/5" : "border-white/5 hover:border-white/10"}`}>
              <div className={`w-3 h-3 rounded-full border-2 ${aiModel===i ? "border-amber-500 bg-amber-500" : "border-white/20"} transition-colors shrink-0`} />
              <div>
                <div className={`text-sm font-semibold ${aiModel===i ? "text-amber-400" : "text-white/60"}`} style={{ fontFamily: "'Syne', sans-serif" }}>{m.name}</div>
                <div className="text-xs text-white/25 mt-0.5">{m.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="glass rounded-xl p-5">
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4" style={{ fontFamily: "'Syne', sans-serif" }}>Качество рендера</h3>
        <div className="flex items-center gap-4">
          <input type="range" min={20} max={100} value={quality} onChange={e => setQuality(+e.target.value)}
            className="flex-1 accent-amber-500 cursor-pointer" />
          <span className="text-sm font-mono font-bold text-amber-400 w-10 text-right">{quality}%</span>
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-[10px] text-white/20">Быстро</span>
          <span className="text-[10px] text-white/20">Максимум</span>
        </div>
      </div>
    </div>
  );
}

type TgSendStatus = "idle" | "sending" | "sent" | "error";

function ExportSection({ editorState, onGoToEditor }: { editorState: EditorState; onGoToEditor: () => void }) {
  const { clip, appliedFilter, appliedTexts, appliedStyle, appliedColor } = editorState;
  const [selected, setSelected] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [done, setDone] = useState(false);
  // Telegram state
  const [tgChatId, setTgChatId] = useState("");
  const [tgCaption, setTgCaption] = useState("");
  const [tgStatus, setTgStatus] = useState<TgSendStatus>("idle");
  const [tgError, setTgError] = useState("");
  const [tgMethod, setTgMethod] = useState<"video" | "link" | null>(null);
  const [showTgHelp, setShowTgHelp] = useState(false);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const SF = { fontFamily: "'Syne', sans-serif" };

  const filterCss = VIDEO_FILTERS.find(f => f.id === appliedFilter)?.css ?? "none";
  const hasOverlays = appliedTexts.length > 0 || appliedStyle || appliedColor || appliedFilter;

  const handleSendTelegram = async () => {
    if (!clip || !tgChatId.trim()) return;
    setTgStatus("sending");
    setTgError("");
    setTgMethod(null);
    try {
      const res = await fetch(API_TELEGRAM, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: tgChatId.trim(),
          videoUrl: clip.videoUrl,
          caption: tgCaption.trim(),
          prompt: clip.prompt,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setTgStatus("error");
        setTgError(data.error || data.details || "Ошибка отправки");
        return;
      }
      setTgStatus("sent");
      setTgMethod(data.method);
    } catch (e: any) {
      setTgStatus("error");
      setTgError(e.message || "Сетевая ошибка");
    }
  };

  const handleExport = async () => {
    if (!clip) return;
    setDownloading(true);
    setDone(false);
    try {
      const res = await fetch(clip.videoUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `export_${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDone(true);
    } finally {
      setDownloading(false);
    }
  };

  const appliedCount = [appliedFilter, appliedStyle, appliedColor].filter(Boolean).length + appliedTexts.length;

  return (
    <div className="flex flex-col h-full gap-5 animate-fade-in overflow-y-auto scrollbar-thin pr-1">
      <div>
        <h2 className="text-2xl font-bold text-white" style={SF}>Экспорт</h2>
        <p className="text-sm text-white/30 mt-1">Предпросмотр с оверлеями и скачивание финального видео</p>
      </div>

      {!clip ? (
        /* ── No clip yet ── */
        <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
          <div className="w-20 h-20 rounded-2xl bg-white/3 border border-white/5 flex items-center justify-center">
            <Icon name="VideoOff" size={32} className="text-white/15" />
          </div>
          <div>
            <div className="font-semibold text-white/40 text-base" style={SF}>Видео ещё не сгенерировано</div>
            <div className="text-sm text-white/20 mt-1">Создайте сцену в редакторе, чтобы экспортировать</div>
          </div>
          <button onClick={onGoToEditor}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all active:scale-95" style={SF}>
            <Icon name="Sparkles" size={16} />
            Перейти в редактор
          </button>
        </div>
      ) : (
        <div className="flex gap-5 flex-1 min-h-0">
          {/* ── Left: preview ── */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/30 font-medium" style={SF}>Предпросмотр с применёнными эффектами</span>
              {appliedCount > 0 && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
                  <Icon name="Layers" size={11} className="text-amber-400" />
                  <span className="text-[10px] text-amber-400 font-semibold">{appliedCount} эффект{appliedCount > 1 ? "а" : ""}</span>
                </div>
              )}
            </div>

            {/* Video preview with filters + text overlays */}
            <div className="relative rounded-xl overflow-hidden bg-black border border-white/5 aspect-video">
              <video
                ref={previewVideoRef}
                src={clip.videoUrl}
                className="w-full h-full object-cover"
                style={{ filter: filterCss }}
                autoPlay
                loop
                muted
                playsInline
              />
              {/* Color overlay */}
              {appliedColor && !appliedColor.startsWith("sound:") && (
                <div className="absolute inset-0 mix-blend-color opacity-30 pointer-events-none"
                  style={{ background: appliedColor }} />
              )}
              {/* Text overlays */}
              {appliedTexts.map((t, i) => (
                <div key={i}
                  className="absolute left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-black/50 backdrop-blur-sm text-white font-bold text-sm text-center max-w-[80%] pointer-events-none"
                  style={{
                    bottom: `${16 + i * 48}px`,
                    fontFamily: "'Syne', sans-serif",
                    textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                  }}>
                  {t}
                </div>
              ))}
              {/* Style badge */}
              {appliedStyle && (
                <div className="absolute top-3 left-3 px-2 py-1 rounded-lg bg-black/60 border border-amber-500/30 text-[10px] text-amber-400 pointer-events-none">
                  {PRESET_STYLES.find(s => s.id === appliedStyle)?.label || appliedStyle.replace("custom:", "")}
                </div>
              )}
              {/* Watermark-free badge */}
              <div className="absolute top-3 right-3 px-2 py-1 rounded-lg bg-black/60 text-[9px] text-white/30 pointer-events-none">
                Runway Gen-3 · {clip.duration}с
              </div>
            </div>

            {/* Applied effects summary */}
            {hasOverlays && (
              <div className="glass rounded-xl p-4 flex flex-col gap-3 animate-fade-in">
                <span className="text-xs text-white/40 font-semibold" style={SF}>Применено к видео</span>
                <div className="flex flex-wrap gap-2">
                  {appliedStyle && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-violet-500/20 bg-violet-500/10 text-xs text-violet-300">
                      <Icon name="Wand2" size={11} />
                      {PRESET_STYLES.find(s => s.id === appliedStyle)?.label || "Свой стиль"}
                    </div>
                  )}
                  {appliedFilter && appliedFilter !== "none" && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-sky-500/20 bg-sky-500/10 text-xs text-sky-300">
                      <Icon name="Sliders" size={11} />
                      {VIDEO_FILTERS.find(f => f.id === appliedFilter)?.label}
                    </div>
                  )}
                  {appliedColor && !appliedColor.startsWith("sound:") && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-pink-500/20 bg-pink-500/10 text-xs text-pink-300">
                      <div className="w-2.5 h-2.5 rounded-full border border-white/20" style={{ background: appliedColor }} />
                      Цвет
                    </div>
                  )}
                  {appliedTexts.map((t, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-500/20 bg-amber-500/10 text-xs text-amber-300 max-w-[200px]">
                      <Icon name="Type" size={11} />
                      <span className="truncate">{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Right: format + download ── */}
          <div className="w-64 flex flex-col gap-4 shrink-0">
            <div>
              <p className="text-xs text-white/30 mb-3" style={SF}>Формат экспорта</p>
              <div className="flex flex-col gap-2">
                {EXPORT_FORMATS.map((f, i) => (
                  <button key={i} onClick={() => setSelected(i)}
                    className={`glass rounded-xl p-3 text-left border transition-all ${selected === i ? "border-amber-500/40 bg-amber-500/5" : "border-white/5 hover:border-white/10"}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-white/80" style={SF}>{f.fmt}</span>
                      {selected === i && <Icon name="CheckCircle2" size={13} className="text-amber-400" />}
                    </div>
                    <div className="text-[10px] text-white/25 mt-0.5">{f.res} · {f.fps}</div>
                    <div className="text-[10px] text-amber-400/50 mt-0.5">{f.size}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Download info */}
            <div className="glass rounded-xl p-3 flex flex-col gap-2">
              <span className="text-xs text-white/30" style={SF}>Что войдёт в экспорт</span>
              {[
                { label: "Видео Runway Gen-3", ok: true },
                { label: `Фильтр: ${VIDEO_FILTERS.find(f => f.id === appliedFilter)?.label ?? "нет"}`, ok: !!appliedFilter && appliedFilter !== "none" },
                { label: `Стиль: ${PRESET_STYLES.find(s => s.id === appliedStyle)?.label ?? "нет"}`, ok: !!appliedStyle },
                { label: `Текстовых оверлеев: ${appliedTexts.length}`, ok: appliedTexts.length > 0 },
                { label: "Цветовой оверлей", ok: !!appliedColor && !appliedColor.startsWith("sound:") },
              ].map(({ label, ok }) => (
                <div key={label} className="flex items-center gap-2">
                  <Icon name={ok ? "CheckCircle2" : "Circle"} size={12} className={ok ? "text-emerald-400" : "text-white/15"} />
                  <span className={`text-[11px] ${ok ? "text-white/60" : "text-white/20"}`}>{label}</span>
                </div>
              ))}
            </div>

            {done && (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 flex items-center gap-2 text-sm text-emerald-400 animate-fade-in">
                <Icon name="CheckCircle2" size={15} />
                Готово! Файл сохранён.
              </div>
            )}

            <button
              onClick={handleExport}
              disabled={downloading}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
              style={SF}>
              {downloading ? (
                <><Icon name="Loader2" size={16} className="animate-spin" />Скачивание...</>
              ) : (
                <><Icon name="Download" size={16} />Скачать видео</>
              )}
            </button>

            {/* ── Telegram block ── */}
            <div className="border-t border-white/5 pt-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-sky-500/15 flex items-center justify-center">
                    <Icon name="Send" size={13} className="text-sky-400" />
                  </div>
                  <span className="text-xs font-semibold text-white/60" style={SF}>Отправить в Telegram</span>
                </div>
                <button onClick={() => setShowTgHelp(v => !v)}
                  className="w-5 h-5 rounded-full border border-white/10 flex items-center justify-center hover:border-sky-500/30 transition-colors">
                  <Icon name="HelpCircle" size={11} className="text-white/25 hover:text-sky-400" />
                </button>
              </div>

              {showTgHelp && (
                <div className="rounded-xl bg-sky-500/5 border border-sky-500/15 p-3 text-[11px] text-white/40 leading-relaxed animate-fade-in">
                  <p className="font-semibold text-sky-400/80 mb-1">Как получить Chat ID:</p>
                  <p>1. Добавьте вашего бота в чат или канал</p>
                  <p>2. Напишите боту любое сообщение</p>
                  <p>3. Откройте <span className="text-sky-400">@userinfobot</span> — он покажет ваш ID</p>
                  <p className="mt-1">Для канала: добавьте бота как администратора и используйте @username канала</p>
                </div>
              )}

              <input
                value={tgChatId}
                onChange={e => { setTgChatId(e.target.value); setTgStatus("idle"); }}
                placeholder="Chat ID или @username канала"
                className="w-full bg-white/5 rounded-xl px-3 py-2.5 text-sm text-white/70 placeholder:text-white/20 border border-white/5 focus:outline-none focus:border-sky-500/40 transition-colors font-mono"
              />

              <textarea
                value={tgCaption}
                onChange={e => setTgCaption(e.target.value)}
                placeholder="Подпись к видео (необязательно)"
                rows={2}
                className="w-full bg-white/5 rounded-xl px-3 py-2 text-sm text-white/70 placeholder:text-white/20 border border-white/5 focus:outline-none focus:border-sky-500/40 transition-colors resize-none scrollbar-thin"
              />

              {tgStatus === "sent" && (
                <div className="rounded-xl bg-sky-500/10 border border-sky-500/20 p-3 flex flex-col gap-1 animate-fade-in">
                  <div className="flex items-center gap-2 text-sm text-sky-300 font-semibold">
                    <Icon name="CheckCircle2" size={14} />
                    Отправлено в Telegram!
                  </div>
                  <p className="text-[10px] text-white/25">
                    {tgMethod === "link" ? "Отправлено как ссылка (бот не мог загрузить видео напрямую)" : "Видео загружено напрямую в чат"}
                  </p>
                </div>
              )}

              {tgStatus === "error" && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400 animate-fade-in">
                  <div className="flex items-center gap-1.5 font-semibold mb-1">
                    <Icon name="AlertCircle" size={13} />
                    Ошибка отправки
                  </div>
                  <p className="text-red-400/70 leading-relaxed">{tgError}</p>
                </div>
              )}

              <button
                onClick={handleSendTelegram}
                disabled={!tgChatId.trim() || tgStatus === "sending"}
                className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                style={SF}>
                {tgStatus === "sending" ? (
                  <><Icon name="Loader2" size={14} className="animate-spin" />Отправляю...</>
                ) : (
                  <><Icon name="Send" size={14} />Отправить в Telegram</>
                )}
              </button>
            </div>

            <p className="text-[10px] text-white/15 text-center leading-relaxed">
              Видео скачается в оригинальном качестве. CSS-фильтры отображаются в предпросмотре.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function HelpSection() {
  const tutorials = [
    { title: "Быстрый старт", desc: "Создайте первый проект за 5 минут", icon: "Rocket", time: "5 мин" },
    { title: "ИИ-генерация сцен", desc: "Как писать эффективные промпты", icon: "Sparkles", time: "8 мин" },
    { title: "Работа с таймлайном", desc: "Редактирование, обрезка и переходы", icon: "Film", time: "12 мин" },
    { title: "Экспорт и форматы", desc: "Оптимальные настройки для разных платформ", icon: "Share2", time: "6 мин" },
    { title: "Эффекты и фильтры", desc: "Библиотека визуальных эффектов", icon: "Wand2", time: "10 мин" },
  ];

  return (
    <div className="flex flex-col h-full gap-5 overflow-y-auto scrollbar-thin pr-1 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-white" style={{ fontFamily: "'Syne', sans-serif" }}>Справка</h2>
        <p className="text-sm text-white/30 mt-1">Туториалы, документация и поддержка</p>
      </div>
      <div className="glass rounded-xl p-4 flex items-center gap-3">
        <Icon name="Search" size={16} className="text-white/30" />
        <input placeholder="Поиск по документации..." className="flex-1 bg-transparent text-sm text-white/60 placeholder:text-white/20 focus:outline-none" />
      </div>
      <div className="flex flex-col gap-3">
        {tutorials.map((t, i) => (
          <div key={i} className="glass rounded-xl p-4 flex items-center gap-4 hover:border-amber-500/20 transition-all group cursor-pointer animate-fade-in"
            style={{ animationDelay: `${i*0.07}s`, animationFillMode: "both" }}>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <Icon name={t.icon as any} size={18} className="text-amber-400" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-white/80 group-hover:text-white text-sm transition-colors" style={{ fontFamily: "'Syne', sans-serif" }}>{t.title}</div>
              <div className="text-xs text-white/30 mt-0.5">{t.desc}</div>
            </div>
            <span className="text-xs text-white/20 shrink-0">{t.time}</span>
            <Icon name="ChevronRight" size={14} className="text-white/20 group-hover:text-amber-400 transition-colors" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Index() {
  const [activeSection, setActiveSection] = useState<Section>("editor");
  const [projects, setProjects] = useState<SavedProject[]>(() => loadProjects());
  const [newProjectId, setNewProjectId] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<EditorState>({
    clip: null,
    appliedStyle: null,
    appliedColor: null,
    appliedFilter: null,
    appliedTexts: [],
  });

  const handleEditorStateChange = useCallback((patch: Partial<EditorState>) => {
    setEditorState(prev => ({ ...prev, ...patch }));
  }, []);

  const handleSaveProject = useCallback((p: SavedProject) => {
    setProjects(prev => {
      const updated = [p, ...prev];
      saveProjects(updated);
      return updated;
    });
    setNewProjectId(p.id);
    setTimeout(() => setNewProjectId(null), 3000);
  }, []);

  const handleDeleteProject = useCallback((id: string) => {
    setProjects(prev => {
      const updated = prev.filter(p => p.id !== id);
      saveProjects(updated);
      return updated;
    });
  }, []);

  const renderSection = () => {
    switch (activeSection) {
      case "editor": return (
        <EditorSection
          onSaveProject={handleSaveProject}
          editorState={editorState}
          onEditorStateChange={handleEditorStateChange}
        />
      );
      case "library": return <LibrarySection />;
      case "projects": return (
        <ProjectsSection
          projects={projects}
          onDelete={handleDeleteProject}
          onGoToEditor={() => setActiveSection("editor")}
        />
      );
      case "settings": return <SettingsSection />;
      case "export": return (
        <ExportSection
          editorState={editorState}
          onGoToEditor={() => setActiveSection("editor")}
        />
      );
      case "help": return <HelpSection />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-amber-500/5 blur-[100px]" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-violet-500/5 blur-[100px]" />
      </div>

      {/* Sidebar */}
      <aside className="w-16 flex flex-col items-center py-5 gap-1 border-r border-white/5 relative z-10 bg-[hsl(var(--surface-1))] shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mb-4 animate-float" style={{ boxShadow: "0 0 20px rgba(251,146,60,0.3)" }}>
          <Icon name="Clapperboard" size={18} className="text-black" />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          {NAV_ITEMS.map(item => (
            <button key={item.id} onClick={() => setActiveSection(item.id)} title={item.label}
              className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all group ${
                activeSection === item.id ? "bg-amber-500/15 text-amber-400" : "text-white/25 hover:text-white/60 hover:bg-white/5"
              }`}>
              <Icon name={item.icon as any} size={18} />
              {/* Badge for projects count */}
              {item.id === "projects" && projects.length > 0 && (
                <div className="absolute -top-0.5 -right-0.5 min-w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                  <span className="text-[9px] font-bold text-black px-0.5">{projects.length > 99 ? "99" : projects.length}</span>
                </div>
              )}
              {activeSection === item.id && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-l-full bg-amber-400" />
              )}
              <div className="absolute left-full ml-3 px-2 py-1 bg-zinc-900 border border-white/10 rounded-lg text-xs text-white/70 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                {item.label}
              </div>
            </button>
          ))}
        </div>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-black font-bold text-sm cursor-pointer hover:scale-105 transition-transform"
          style={{ fontFamily: "'Syne', sans-serif" }}>
          A
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-12 flex items-center justify-between px-5 border-b border-white/5 bg-[hsl(var(--surface-1))] shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-bold text-white/80" style={{ fontFamily: "'Syne', sans-serif" }}>
              {NAV_ITEMS.find(n => n.id === activeSection)?.label}
            </span>
            {activeSection === "editor" && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-fade-in">
                Рекламный ролик Nike
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {editorState.clip && activeSection === "editor" && (
              <button
                onClick={() => setActiveSection("export")}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all active:scale-95 animate-fade-in"
                style={{ fontFamily: "'Syne', sans-serif" }}>
                <Icon name="Download" size={13} />
                Экспорт
              </button>
            )}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400" style={{ fontFamily: "'Syne', sans-serif" }}>ИИ готов</span>
            </div>
            <button className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center transition-colors">
              <Icon name="Bell" size={15} className="text-white/30" />
            </button>
          </div>
        </header>
        <div className="flex-1 p-5 overflow-hidden min-h-0">
          {renderSection()}
        </div>
      </main>

      {/* Save toast notification */}
      {newProjectId && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[hsl(var(--surface-1))] border border-emerald-500/30 shadow-2xl"
            style={{ boxShadow: "0 0 30px rgba(52,211,153,0.15)" }}>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Icon name="BookmarkCheck" size={14} className="text-emerald-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white/80" style={{ fontFamily: "'Syne', sans-serif" }}>Проект сохранён</div>
              <div className="text-xs text-white/30">Доступен в разделе «Проекты»</div>
            </div>
            <button onClick={() => setActiveSection("projects")}
              className="ml-2 px-3 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-xs text-emerald-400 font-semibold transition-all border border-emerald-500/20"
              style={{ fontFamily: "'Syne', sans-serif" }}>
              Открыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}