/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect, useCallback } from "react";
import Icon from "@/components/ui/icon";

const API_GENERATE = "https://functions.poehali.dev/41ee0003-70f4-4f10-9198-9c316970c345";
const API_CHECK = "https://functions.poehali.dev/a4867ee5-4dfc-4ec4-bf50-f3681ee61227";

type GenStatus = "idle" | "pending" | "running" | "done" | "error";

interface GeneratedClip {
  videoUrl: string;
  prompt: string;
  duration: number;
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

function EditorSection() {
  const [aiPrompt, setAiPrompt] = useState("");
  const [duration, setDuration] = useState(10);
  const [genStatus, setGenStatus] = useState<GenStatus>("idle");
  const [genProgress, setGenProgress] = useState(0);
  const [genError, setGenError] = useState("");
  const [clip, setClip] = useState<GeneratedClip | null>(null);
  const [playhead, setPlayhead] = useState(33);
  const [isPlaying, setIsPlaying] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

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
                <a href={clip.videoUrl} target="_blank" rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-xs text-emerald-400 transition-all">
                  <Icon name="Download" size={12} />
                  Скачать видео
                </a>
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
            {[
              { icon: "Wand2", label: "Стиль" },
              { icon: "Palette", label: "Цвет" },
              { icon: "Music", label: "Звук" },
              { icon: "Type", label: "Текст" },
              { icon: "Layers", label: "Слои" },
              { icon: "Sliders", label: "Фильтры" },
            ].map(({ icon, label }) => (
              <button key={icon} className="flex flex-col items-center gap-1 py-2 px-1 rounded-lg bg-white/3 hover:bg-amber-500/10 border border-white/5 hover:border-amber-500/20 transition-all group">
                <Icon name={icon as any} size={15} className="text-white/40 group-hover:text-amber-400 transition-colors" />
                <span className="text-[10px] text-white/30 group-hover:text-white/60 transition-colors">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

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

function ProjectsSection() {
  return (
    <div className="flex flex-col h-full gap-5 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white" style={{ fontFamily: "'Syne', sans-serif" }}>Мои проекты</h2>
          <p className="text-sm text-white/30 mt-1">История работ и сохранённые проекты</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-all active:scale-95"
          style={{ fontFamily: "'Syne', sans-serif" }}>
          <Icon name="Plus" size={15} />
          Новый проект
        </button>
      </div>
      <div className="flex flex-col gap-3 overflow-y-auto scrollbar-thin pr-1">
        {PROJECTS.map((proj, i) => (
          <div key={i} className="glass rounded-xl p-4 flex items-center gap-4 hover:border-amber-500/20 transition-all group cursor-pointer animate-fade-in"
            style={{ animationDelay: `${i * 0.08}s`, animationFillMode: "both" }}>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-900/40 to-zinc-900 border border-white/5 flex items-center justify-center shrink-0">
              <Icon name="Film" size={20} className="text-amber-400/60" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-white/80 group-hover:text-white transition-colors" style={{ fontFamily: "'Syne', sans-serif" }}>{proj.name}</div>
              <div className="text-xs text-white/30 mt-0.5">Изменён: {proj.modified} · {proj.duration}</div>
            </div>
            <div className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
              proj.status === "active" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
              proj.status === "render" ? "bg-sky-500/10 text-sky-400 border-sky-500/20 animate-pulse-glow" :
              "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            }`}>
              {proj.status === "active" ? "В работе" : proj.status === "render" ? "Рендер..." : "Готов"}
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {["FolderOpen","Copy","Trash2"].map(icon => (
                <button key={icon} className="w-7 h-7 rounded-lg hover:bg-white/5 flex items-center justify-center transition-colors">
                  <Icon name={icon as any} size={14} className="text-white/30 hover:text-white/70" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
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

function ExportSection() {
  const [selected, setSelected] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const startExport = () => {
    setExporting(true);
    setProgress(0);
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { clearInterval(interval); setExporting(false); return 100; }
        return p + 2;
      });
    }, 80);
  };

  return (
    <div className="flex flex-col h-full gap-5 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-white" style={{ fontFamily: "'Syne', sans-serif" }}>Экспорт</h2>
        <p className="text-sm text-white/30 mt-1">Выберите формат и качество для сохранения видео</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {EXPORT_FORMATS.map((f, i) => (
          <button key={i} onClick={() => setSelected(i)}
            className={`glass rounded-xl p-4 text-left border transition-all hover:scale-[1.01] ${selected===i ? "border-amber-500/40 bg-amber-500/5" : "border-white/5 hover:border-white/10"}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-sm text-white/80" style={{ fontFamily: "'Syne', sans-serif" }}>{f.fmt}</span>
              {selected===i && <Icon name="CheckCircle2" size={15} className="text-amber-400" />}
            </div>
            <div className="text-xs text-white/30">{f.res} · {f.fps}</div>
            <div className="text-xs text-amber-400/60 mt-1">{f.size}</div>
          </button>
        ))}
      </div>
      {exporting ? (
        <div className="glass rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-white/70" style={{ fontFamily: "'Syne', sans-serif" }}>Экспорт видео...</span>
            <span className="text-sm font-mono text-amber-400">{progress}%</span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full transition-all duration-100" style={{ width: `${progress}%` }} />
          </div>
          {progress === 100 && (
            <div className="mt-3 flex items-center gap-2 text-sm text-emerald-400 animate-fade-in">
              <Icon name="CheckCircle2" size={15} />
              Видео успешно экспортировано!
            </div>
          )}
        </div>
      ) : (
        <button onClick={startExport}
          className="mt-auto py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-base tracking-wide transition-all active:scale-95 flex items-center justify-center gap-2"
          style={{ fontFamily: "'Syne', sans-serif" }}>
          <Icon name="Download" size={18} />
          Экспортировать видео
        </button>
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

  const renderSection = () => {
    switch (activeSection) {
      case "editor": return <EditorSection />;
      case "library": return <LibrarySection />;
      case "projects": return <ProjectsSection />;
      case "settings": return <SettingsSection />;
      case "export": return <ExportSection />;
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
    </div>
  );
}