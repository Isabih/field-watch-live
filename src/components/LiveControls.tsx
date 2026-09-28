import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Maximize, Minimize, Play, RotateCcw, Sparkles, Undo2 } from "lucide-react";
import { useField, useNow } from "@/lib/field-mqtt";
import { generatePresentationLayout, type AudienceDistance, type PresentationLayout } from "@/lib/presentation-layout.functions";

export function formatElapsed(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
  const s = String(t % 60).padStart(2, "0");
  return h ? `${h}:${m}:${s}` : `${m}:${s}`;
}

/** Browser-session only: run label, audience distance and applied layout. */
export function usePresentationLayout() {
  const [layout, setLayoutState] = useState<PresentationLayout | null>(null);
  const [runLabel, setRunLabelState] = useState("");
  const [distance, setDistanceState] = useState<AudienceDistance>("room");
  useEffect(() => {
    try {
      const l = sessionStorage.getItem("fc-layout");
      if (l) setLayoutState(JSON.parse(l));
      setRunLabelState(sessionStorage.getItem("fc-run-label") ?? "");
      const d = sessionStorage.getItem("fc-distance");
      if (d === "near" || d === "room" || d === "projector") setDistanceState(d);
    } catch { /* ignore */ }
  }, []);
  const setLayout = (l: PresentationLayout | null) => {
    setLayoutState(l);
    if (l) sessionStorage.setItem("fc-layout", JSON.stringify(l)); else sessionStorage.removeItem("fc-layout");
  };
  const setRunLabel = (v: string) => { setRunLabelState(v); sessionStorage.setItem("fc-run-label", v); };
  const setDistance = (v: AudienceDistance) => { setDistanceState(v); sessionStorage.setItem("fc-distance", v); };
  return { layout, setLayout, runLabel, setRunLabel, distance, setDistance };
}

export function RunControls({ runLabel }: { runLabel: string }) {
  const { state, start, reset } = useField();
  const [full, setFull] = useState(false);
  useEffect(() => {
    const onChange = () => {
      const on = !!document.fullscreenElement;
      setFull(on);
      document.documentElement.classList.toggle("presentation-focus", on);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen blocked (e.g. inside a frame): fall back to focus mode only.
      const on = !document.documentElement.classList.contains("presentation-focus");
      document.documentElement.classList.toggle("presentation-focus", on);
      setFull(on);
    }
  };
  const running = state.runStatus === "running";
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
      <div className="mr-auto min-w-0">
        <p className="text-xs font-bold uppercase text-muted-foreground">Current run</p>
        <p className="truncate font-display text-lg font-bold">{runLabel.trim() || "Current run"} · <span className={running ? "text-ok" : "text-muted-foreground"}>{running ? "Running" : "Ready"}</span></p>
      </div>
      <button onClick={start} className="flex items-center gap-2 rounded-md bg-ok px-5 py-3 font-display font-bold text-ok-foreground hover:opacity-90">
        <Play className="size-5" /> Start Run
      </button>
      <button onClick={reset} className="flex items-center gap-2 rounded-md border px-5 py-3 font-display font-bold hover:bg-muted">
        <RotateCcw className="size-5" /> Reset Run
      </button>
      <button onClick={toggleFull} className="flex items-center gap-2 rounded-md border px-5 py-3 font-display font-bold hover:bg-muted">
        {full ? <Minimize className="size-5" /> : <Maximize className="size-5" />} {full ? "Exit Fullscreen" : "Fullscreen"}
      </button>
    </div>
  );
}

type Tone = "ok" | "caution" | "idle";
function Pill({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  const c = tone === "ok" ? "border-ok/40 text-ok" : tone === "caution" ? "border-caution/40 text-caution" : "text-muted-foreground";
  const dot = tone === "ok" ? "bg-ok animate-beacon" : tone === "caution" ? "bg-caution animate-pulse" : "bg-idle";
  return (
    <div className={`flex items-center gap-3 rounded-lg border bg-card px-3 py-2 ${c}`}>
      <span className={`size-2.5 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-bold">{value}</p>
      </div>
    </div>
  );
}

const SENSOR_ACTIVE_MS = 60_000;

export function HealthStrip({ vertical }: { vertical?: boolean }) {
  const { link, state, reconnectAttempt } = useField();
  const now = useNow(1000);
  const online = link === "online";
  const backend: [string, Tone] = online ? ["Online", "ok"] : link === "connecting" ? [`Reconnecting${reconnectAttempt > 1 ? ` · try ${reconnectAttempt}` : ""}`, "caution"] : ["Demo mode · retrying", "idle"];
  const mqtt: [string, Tone] = !online ? ["Unknown in demo", "idle"] : state.mqttConnected ? [`Connected · ${state.mqttHost}`, "ok"] : ["Reconnecting to broker", "caution"];
  const sensor = (at: number | null): [string, Tone] => {
    if (!online) return ["Demo mode", "idle"];
    if (at === null) return ["Waiting for first signal", "idle"];
    const ago = Math.round((now - at) / 1000);
    return ago * 1000 < SENSOR_ACTIVE_MS ? [`Active · ${ago}s ago`, "ok"] : [`Last seen ${formatElapsed(now - at)} ago`, "caution"];
  };
  const us = sensor(state.stageSensorLastSeenAt);
  const ln = sensor(state.lineSensorLastSeenAt);
  return (
    <div className={`grid gap-3 ${vertical ? "" : "sm:grid-cols-2 lg:grid-cols-4"}`} aria-label="System health">
      <Pill label="Backend" value={backend[0]} tone={backend[1]} />
      <Pill label="MQTT broker" value={mqtt[0]} tone={mqtt[1]} />
      <Pill label="Ultrasonic sensor" value={us[0]} tone={us[1]} />
      <Pill label="Line sensor" value={ln[0]} tone={ln[1]} />
    </div>
  );
}

export function AiLayoutPanel(p: {
  layout: PresentationLayout | null;
  setLayout: (l: PresentationLayout | null) => void;
  runLabel: string;
  setRunLabel: (v: string) => void;
  distance: AudienceDistance;
  setDistance: (v: AudienceDistance) => void;
}) {
  const gen = useServerFn(generatePresentationLayout);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      p.setLayout(await gen({ data: { audienceDistance: p.distance, runLabel: p.runLabel } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create a layout. Your current layout is unchanged.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="app-controls rounded-lg border bg-card p-4" aria-label="Presentation setup">
      <div className="flex items-center gap-2">
        <Sparkles className="size-5 text-caution" />
        <h2 className="font-display text-lg font-bold">Presentation setup</h2>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <label className="text-sm">
          <span className="text-xs font-bold uppercase text-muted-foreground">Run / rider label</span>
          <input value={p.runLabel} onChange={(e) => p.setRunLabel(e.target.value)} maxLength={60} placeholder="e.g. Rider 07 · Final" className="mt-1 w-full rounded-md border bg-background px-3 py-2" />
        </label>
        <div>
          <span className="text-xs font-bold uppercase text-muted-foreground">Audience distance</span>
          <div className="mt-1 flex gap-1 rounded-md border p-1">
            {(["near", "room", "projector"] as const).map((d) => (
              <button key={d} onClick={() => p.setDistance(d)} className={`rounded px-3 py-1.5 text-sm font-semibold capitalize ${p.distance === d ? "bg-muted text-foreground" : "text-muted-foreground"}`}>{d}</button>
            ))}
          </div>
        </div>
        <div className="flex items-end gap-2">
          <button onClick={run} disabled={busy} className="flex items-center gap-2 rounded-md bg-caution px-4 py-2 font-bold text-background disabled:opacity-60">
            <Sparkles className="size-4" /> {busy ? "Designing…" : "Generate layout"}
          </button>
          {p.layout && (
            <button onClick={() => p.setLayout(null)} className="flex items-center gap-2 rounded-md border px-4 py-2 font-bold hover:bg-muted">
              <Undo2 className="size-4" /> Default
            </button>
          )}
        </div>
      </div>
      {p.layout && <p className="mt-3 text-sm text-muted-foreground">AI layout applied: {p.layout.rationale}</p>}
      {error && <p className="mt-3 text-sm text-fault" role="alert">{error}</p>}
    </section>
  );
}
