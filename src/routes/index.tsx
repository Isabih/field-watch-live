import { createFileRoute } from "@tanstack/react-router";
import { Activity, Bike, CircleAlert, Waves } from "lucide-react";
import { FLASH_MS, START_MARKS, useField, useNow } from "@/lib/field-mqtt";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Live View | Field Command" },
      { name: "description", content: "Live presentation of the ultrasonic stage sensor and line-violation sensor with instant fault effects." },
      { property: "og:title", content: "Live View | Field Command" },
      { property: "og:description", content: "Watch stage switching and line violations happen live." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LiveView,
});

function LiveView() {
  const { state } = useField();
  const now = useNow();
  const lineFlash = state.lastLineAt !== null && now - state.lastLineAt < FLASH_MS;
  const stageFlash = state.lastStageAt !== null && now - state.lastStageAt < FLASH_MS;
  const stage = state.activeStage;
  const low = state.marks < START_MARKS / 2;

  return (
    <div className="space-y-5">
      {lineFlash && (
        <div className="flex items-center justify-center gap-3 rounded-lg border-2 border-fault bg-fault/15 px-4 py-4 text-fault animate-alarm" role="alert">
          <CircleAlert className="size-7" />
          <p className="font-display text-xl font-bold uppercase sm:text-2xl">Line violation · Stage {stage} · −5 marks</p>
        </div>
      )}
      {stageFlash && !lineFlash && (
        <div className="flex items-center justify-center gap-3 rounded-lg border-2 border-ok bg-ok/15 px-4 py-4 text-ok" role="status">
          <Waves className="size-7" />
          <p className="font-display text-xl font-bold uppercase sm:text-2xl">Stage 1 finished · Stage 2 active</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Big label="Remaining marks" value={state.marks} tone={low ? "fault" : "default"}>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full transition-all ${low ? "bg-fault" : "bg-ok"}`} style={{ width: `${state.marks}%` }} /></div>
        </Big>
        <Big label="Current stage" value={`Stage ${stage}`} tone="ok" note={stage === 1 ? "Waiting for ultrasonic" : "Stage 1 completed"} />
        <Big label="Line faults" value={state.faults} tone={state.faults ? "fault" : "default"} note={`S1: ${state.stage1Faults} · S2: ${state.stage2Faults}`} />
        <Big label="Deducted" value={`−${START_MARKS - state.marks}`} tone={state.faults ? "fault" : "default"} note="5 marks per violation" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <FieldRoad stage={stage} lineFlash={lineFlash} stageFlash={stageFlash} />
        <div className="space-y-5">
          <SensorCard title="Ultrasonic · stage switch" topic="bike/stage_switching" active={stageFlash} activeText="OBJECT ≤ 4 m · HIGH" idleText="Range clear" tone="ok" icon={<Waves className="size-6" />} />
          <SensorCard title="Limiter · line violation" topic="bike/line_violation" active={lineFlash} activeText="LINE TOUCHED · HIGH" idleText="Line clear" tone="fault" icon={<CircleAlert className="size-6" />} />
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs font-bold uppercase text-muted-foreground">Stage progress</p>
            <div className="mt-3 flex items-center gap-2">
              <StageDot n={1} done={stage === 2} active={stage === 1} />
              <div className={`h-1 flex-1 rounded ${stage === 2 ? "bg-ok" : "bg-muted"}`} />
              <StageDot n={2} done={false} active={stage === 2} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Big({ label, value, note, tone = "default", children }: { label: string; value: string | number; note?: string; tone?: "default" | "ok" | "fault"; children?: React.ReactNode }) {
  const c = tone === "ok" ? "text-ok" : tone === "fault" ? "text-fault" : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-5">
      <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
      <p className={`mt-2 font-display text-5xl font-bold ${c}`}>{value}</p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
      {children}
    </div>
  );
}

function StageDot({ n, done, active }: { n: number; done: boolean; active: boolean }) {
  return (
    <div className={`flex size-10 items-center justify-center rounded-full border-2 font-display font-bold ${active ? "border-ok bg-ok/15 text-ok" : done ? "border-ok bg-ok text-ok-foreground" : "border-border text-muted-foreground"}`}>{n}</div>
  );
}

function SensorCard({ title, topic, active, activeText, idleText, tone, icon }: { title: string; topic: string; active: boolean; activeText: string; idleText: string; tone: "ok" | "fault"; icon: React.ReactNode }) {
  const on = tone === "ok" ? "border-ok bg-ok/10 text-ok shadow-sensor" : "border-fault bg-fault/10 text-fault animate-alarm";
  return (
    <div className={`rounded-lg border-2 p-4 transition-colors ${active ? on : "border-border bg-card"}`}>
      <div className="flex items-center gap-3">
        <div className={`flex size-12 items-center justify-center rounded-lg border ${active ? "border-current" : "text-muted-foreground"}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-muted-foreground">{title}</p>
          <p className={`font-display text-lg font-bold ${active ? "" : "text-foreground"}`}>{active ? activeText : idleText}</p>
        </div>
      </div>
      <p className="mt-2 truncate font-mono text-[10px] text-muted-foreground">{topic}</p>
    </div>
  );
}

function FieldRoad({ stage, lineFlash, stageFlash }: { stage: 1 | 2; lineFlash: boolean; stageFlash: boolean }) {
  const s1Line = lineFlash && stage === 1;
  const s2Line = lineFlash && stage === 2;
  const lineCls = (fault: boolean, current: boolean) =>
    fault ? "h-2 bg-fault animate-alarm shadow-[0_0_24px_var(--fault)]" : current ? "h-1.5 bg-ok" : "h-1 bg-ok/30";

  return (
    <section className="overflow-hidden rounded-lg border bg-field" aria-label="Virtual field">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3">
        <div>
          <p className="text-xs font-bold uppercase text-muted-foreground">Live field view</p>
          <h1 className="font-display text-lg font-semibold">Roadside detection zone</h1>
        </div>
        <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase ${stageFlash ? "border-ok/50 bg-ok/10 text-ok" : "text-muted-foreground"}`}>
          <span className={`size-2 rounded-full ${stageFlash ? "bg-ok animate-beacon" : "bg-idle"}`} /> Ultrasonic {stageFlash ? "high" : "low"}
        </div>
      </div>

      <div className="field-grid relative h-[440px] overflow-hidden">
        <div className={`absolute inset-y-0 left-[24%] w-[52%] border-x-4 bg-road ${lineFlash ? "border-fault" : "border-foreground/20"}`}>
          <div className="absolute inset-y-0 left-1/2 border-l-2 border-dashed border-caution/60" />
          {/* Stage 2 zone (top) and stage 1 zone (bottom) */}
          <div className={`absolute inset-x-0 top-0 h-1/2 ${stage === 2 ? "bg-ok/5" : ""}`} />
          <div className={`absolute inset-x-0 bottom-0 h-1/2 ${stage === 1 ? "bg-ok/5" : ""}`} />
          <div className={`absolute inset-x-0 top-[22%] rounded ${lineCls(s2Line, stage === 2)}`} />
          <div className={`absolute inset-x-0 top-[72%] rounded ${lineCls(s1Line, stage === 1)}`} />
          <span className={`absolute left-3 top-[14%] text-xs font-bold uppercase ${s2Line ? "text-fault" : "text-muted-foreground"}`}>Stage 2 line</span>
          <span className={`absolute left-3 top-[64%] text-xs font-bold uppercase ${s1Line ? "text-fault" : "text-muted-foreground"}`}>Stage 1 line</span>
          <div className={`absolute left-1/2 -translate-x-1/2 transition-all duration-700 ${stage === 1 ? "top-[78%]" : "top-[30%]"}`}>
            <div className={`flex size-14 items-center justify-center rounded-full border-2 bg-card ${lineFlash ? "border-fault text-fault" : "border-ok text-ok"}`}><Bike className="size-7" /></div>
          </div>
        </div>

        {/* Ultrasonic sensor sits at the boundary between stage 1 and stage 2 */}
        <div className="absolute left-3 top-1/2 z-20 -translate-y-1/2 sm:left-[7%]">
          <div className={`flex h-20 w-14 flex-col items-center justify-center gap-1 rounded-lg border-2 bg-card ${stageFlash ? "border-ok shadow-sensor" : "border-border"}`}>
            <Waves className={`size-6 ${stageFlash ? "text-ok" : "text-muted-foreground"}`} />
            <span className="text-[9px] font-bold uppercase text-muted-foreground">US-01</span>
          </div>
        </div>
        <div className={`sensor-cone absolute left-[12%] top-1/2 h-40 w-[45%] -translate-y-1/2 ${stageFlash ? "is-active" : ""}`}>
          {stageFlash && <div className="absolute inset-0 animate-beam" />}
        </div>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-right">
          <Activity className={`ml-auto size-5 ${stageFlash ? "text-ok" : "text-muted-foreground"}`} />
          <p className="mt-1 text-[10px] font-bold uppercase text-muted-foreground">4 m range</p>
        </div>

        <div className={`absolute inset-x-0 bottom-0 flex items-center justify-between border-t px-4 py-3 backdrop-blur-sm ${lineFlash ? "bg-fault/20" : "bg-card/95"}`}>
          <span className="text-xs font-bold uppercase text-muted-foreground">Status</span>
          <span className={`text-sm font-bold ${lineFlash ? "text-fault" : "text-ok"}`}>
            {lineFlash ? `FAULT · STAGE ${stage} LINE TOUCHED` : stage === 1 ? "STAGE 1 RUNNING · NO FAULT" : "STAGE 2 RUNNING · NO FAULT"}
          </span>
        </div>
      </div>
    </section>
  );
}
