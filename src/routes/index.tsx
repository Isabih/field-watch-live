import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  Antenna,
  Check,
  CircleAlert,
  Gauge,
  Radio,
  RefreshCw,
  RotateCcw,
  Waves,
} from "lucide-react";
import { useState } from "react";
import {
  DEFAULT_BROKER,
  FAULT_PENALTY,
  START_MARKS,
  TOPICS,
  useFieldMonitor,
  type FieldEvent,
} from "@/lib/field-mqtt";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Field Command | Live MQTT Competition Monitor" },
      {
        name: "description",
        content:
          "Professional live field monitor for MQTT line-touch faults, ultrasonic stage switching, and competition scoring.",
      },
      { property: "og:title", content: "Field Command | Live MQTT Competition Monitor" },
      {
        property: "og:description",
        content: "Monitor line faults, ultrasonic detections, stage transitions, and remaining marks live.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const buttonBase =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

function StatusLight({ active, fault = false }: { active: boolean; fault?: boolean }) {
  return (
    <span className="relative flex size-3 shrink-0 items-center justify-center" aria-hidden="true">
      {active && <span className={`absolute size-3 rounded-full ${fault ? "bg-fault" : "bg-ok"} animate-beacon`} />}
      <span className={`relative size-2.5 rounded-full ${active ? (fault ? "bg-fault" : "bg-ok") : "bg-idle"}`} />
    </span>
  );
}

function Metric({ label, value, note, tone = "default" }: { label: string; value: string | number; note: string; tone?: "default" | "ok" | "fault" }) {
  const toneClass = tone === "ok" ? "text-ok" : tone === "fault" ? "text-fault" : "text-foreground";
  return (
    <div className="border-t-2 border-border bg-card p-4">
      <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
      <p className={`mt-2 font-display text-4xl font-bold ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function FieldRoad({ stage, stage1Fault, stage2Fault }: { stage: 1 | 2; stage1Fault: boolean; stage2Fault: boolean }) {
  const detected = stage === 2;
  return (
    <section className="overflow-hidden rounded-lg border bg-field" aria-label="Virtual field view">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3">
        <div>
          <p className="text-xs font-bold uppercase text-muted-foreground">Live field view</p>
          <h2 className="font-display text-lg font-semibold">Roadside detection zone</h2>
        </div>
        <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase ${detected ? "border-ok/50 bg-ok/10 text-ok" : "border-border bg-muted text-muted-foreground"}`}>
          <StatusLight active={detected} />
          Ultrasonic {detected ? "high" : "low"}
        </div>
      </div>

      <div className="relative min-h-[430px] overflow-hidden field-grid">
        <div className="absolute inset-y-0 left-[22%] w-[56%] border-x border-dashed border-field-line/40 bg-road">
          <div className="absolute inset-y-0 left-1/2 w-px border-l-2 border-dashed border-caution/50" />
          <div className={`absolute inset-x-0 top-[34%] h-1 ${stage1Fault ? "bg-fault animate-alarm" : "bg-foreground/20"}`} />
          <div className={`absolute inset-x-0 top-[70%] h-1 ${stage2Fault ? "bg-fault animate-alarm" : "bg-foreground/20"}`} />
          <span className="absolute left-3 top-[27%] text-xs font-bold uppercase text-muted-foreground">Stage 1 line</span>
          <span className="absolute left-3 top-[63%] text-xs font-bold uppercase text-muted-foreground">Stage 2 line</span>
        </div>

        <div className="absolute left-4 top-1/2 z-20 -translate-y-1/2 sm:left-[8%]">
          <div className="relative flex flex-col items-center">
            <div className={`relative z-10 flex h-24 w-14 flex-col items-center justify-center gap-2 rounded-lg border-2 bg-card ${detected ? "border-ok shadow-sensor" : "border-border"}`}>
              <Waves className={`size-6 ${detected ? "text-ok" : "text-muted-foreground"}`} />
              <span className="text-[9px] font-bold uppercase text-muted-foreground">US-01</span>
            </div>
            <div className="h-14 w-2 bg-field-line" />
            <div className="h-2 w-20 bg-field-line" />
          </div>
        </div>

        <div className={`sensor-cone absolute left-[13%] top-1/2 h-56 w-[40%] -translate-y-1/2 ${detected ? "is-active" : ""}`}>
          {detected && <div className="absolute inset-0 animate-beam" />}
        </div>

        <div className={`absolute left-[51%] top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-500 ${detected ? "scale-100 opacity-100" : "scale-90 opacity-20"}`}>
          <div className={`relative flex h-32 w-20 items-center justify-center rounded-lg border-2 bg-card/80 ${detected ? "border-ok animate-detection" : "border-border"}`}>
            <Activity className={detected ? "text-ok" : "text-muted-foreground"} />
          </div>
          <p className={`mt-3 text-center text-xs font-bold uppercase ${detected ? "text-ok" : "text-muted-foreground"}`}>
            {detected ? "Object detected" : "Range clear"}
          </p>
        </div>

        <div className="absolute right-4 top-4 grid gap-2 sm:right-6">
          <div className={`min-w-36 rounded-lg border px-3 py-2 ${stage === 1 ? "border-ok/50 bg-ok/10" : "border-border bg-card/90"}`}>
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Stage 1</p>
            <p className={`text-sm font-bold ${stage === 1 ? "text-ok" : "text-foreground"}`}>{stage === 1 ? "Active" : "Free"}</p>
          </div>
          <div className={`min-w-36 rounded-lg border px-3 py-2 ${stage === 2 ? "border-ok/50 bg-ok/10" : "border-border bg-card/90"}`}>
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Stage 2</p>
            <p className={`text-sm font-bold ${stage === 2 ? "text-ok" : "text-foreground"}`}>{stage === 2 ? "Active" : "Standby"}</p>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t bg-card/95 px-4 py-3 backdrop-blur-sm">
          <span className="text-xs font-bold uppercase text-muted-foreground">Detection result</span>
          <span className={`text-sm font-bold ${detected ? "text-ok" : "text-muted-foreground"}`}>
            {detected ? "HIGH · STAGE 1 FREE · NO FAULT" : "LOW · STAGE 1 RUNNING"}
          </span>
        </div>
      </div>
    </section>
  );
}

function EventRow({ event }: { event: FieldEvent }) {
  const icon = event.kind === "fault" ? <CircleAlert className="size-3.5" /> : event.kind === "switch" ? <RefreshCw className="size-3.5" /> : <Radio className="size-3.5" />;
  const tone = event.kind === "fault" ? "text-fault" : event.kind === "switch" ? "text-caution" : "text-ok";
  return (
    <li className="grid grid-cols-[70px_18px_1fr] gap-2 border-b py-2 text-xs last:border-0">
      <time className="font-mono text-muted-foreground">{new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
      <span className={tone}>{icon}</span>
      <div className="min-w-0">
        <p className={`font-semibold ${tone}`}>{event.message}</p>
        <p className="truncate font-mono text-[10px] text-muted-foreground">{event.topic}</p>
      </div>
    </li>
  );
}

function Index() {
  const [brokerInput, setBrokerInput] = useState(DEFAULT_BROKER);
  const [broker, setBroker] = useState(DEFAULT_BROKER);
  const [nonce, setNonce] = useState(0);
  const { state, status, publish, reset } = useFieldMonitor(broker, nonce);
  const online = status === "online";
  const detectionHigh = state.activeStage === 2;

  return (
    <main className="dark min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b pb-5">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-lg border bg-card text-caution"><Antenna className="size-6" /></div>
            <div>
              <h1 className="font-display text-xl font-bold sm:text-2xl">Field Command</h1>
              <p className="text-xs text-muted-foreground">Industrial line and stage monitoring</p>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <div className="hidden text-right sm:block"><p className="text-[10px] font-bold uppercase text-muted-foreground">Current phase</p><p className="text-sm font-bold">Stage {state.activeStage}</p></div>
            <div className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold uppercase ${online ? "border-ok/40 bg-ok/10 text-ok" : "border-border bg-card text-muted-foreground"}`}>
              <StatusLight active={online} /> Broker {status}
            </div>
          </div>
        </header>

        <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
          <aside className="space-y-5">
            <div className="relative overflow-hidden rounded-lg border bg-card p-5 text-center">
              <div className={`absolute inset-x-0 top-0 h-1 ${state.marks < START_MARKS / 2 ? "bg-fault" : "bg-ok"}`} />
              <p className="text-xs font-bold uppercase text-muted-foreground">Remaining marks</p>
              <p className={`mt-2 font-display text-6xl font-bold ${state.marks < START_MARKS / 2 ? "text-fault" : "text-foreground"}`}>{state.marks}</p>
              <div className="mx-auto mt-4 h-2 max-w-40 overflow-hidden rounded-full bg-muted"><div className="h-full bg-ok transition-all" style={{ width: `${state.marks}%` }} /></div>
              <p className="mt-2 text-xs text-muted-foreground">Started with {START_MARKS}</p>
            </div>

            <section className="rounded-lg border bg-card p-4">
              <div className="mb-4 flex items-center gap-2"><Radio className="size-4 text-ok" /><h2 className="text-xs font-bold uppercase">Live MQTT broker</h2></div>
              <label className="text-[10px] font-bold uppercase text-muted-foreground" htmlFor="broker">WebSocket address</label>
              <input id="broker" value={brokerInput} onChange={(event) => setBrokerInput(event.target.value)} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs outline-none transition-colors focus:border-ok" />
              <button className={`${buttonBase} mt-3 w-full border-ok bg-ok text-ok-foreground hover:bg-ok/90`} onClick={() => { setBroker(brokerInput); setNonce((value) => value + 1); }}><Radio className="size-4" />Connect</button>
            </section>

            <section className="rounded-lg border bg-card p-4">
              <h2 className="mb-3 text-xs font-bold uppercase">Sensor states</h2>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Stage 1 line</span><span className={`flex items-center gap-2 font-semibold ${state.stage1Fault ? "text-fault" : "text-ok"}`}><StatusLight active fault={state.stage1Fault} />{state.stage1Fault ? "Fault" : "Clear"}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Stage 2 line</span><span className={`flex items-center gap-2 font-semibold ${state.stage2Fault ? "text-fault" : "text-ok"}`}><StatusLight active fault={state.stage2Fault} />{state.stage2Fault ? "Fault" : "Clear"}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Ultrasonic</span><span className={`flex items-center gap-2 font-semibold ${detectionHigh ? "text-ok" : "text-muted-foreground"}`}><StatusLight active={detectionHigh} />{detectionHigh ? "High" : "Low"}</span></div>
              </div>
            </section>
          </aside>

          <div className="min-w-0 space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <Metric label="Active stage" value={`0${state.activeStage}`} note={detectionHigh ? "Stage 1 is free" : "Stage 1 running"} tone="ok" />
              <Metric label="Line faults" value={String(state.faults).padStart(2, "0")} note={`${FAULT_PENALTY} marks each`} tone={state.faults ? "fault" : "default"} />
              <Metric label="Switch sensor" value={detectionHigh ? "HIGH" : "LOW"} note={detectionHigh ? "Object in range" : "Range is clear"} tone={detectionHigh ? "ok" : "default"} />
            </div>
            <FieldRoad stage={state.activeStage} stage1Fault={state.stage1Fault} stage2Fault={state.stage2Fault} />

            <section className="rounded-lg border bg-card p-4">
              <div className="mb-3 flex items-center justify-between"><h2 className="text-xs font-bold uppercase">Test controls</h2><button aria-label="Reset marks and events" title="Reset marks and events" onClick={reset} className={`${buttonBase} size-9 min-h-0 px-0 text-muted-foreground hover:bg-muted hover:text-foreground`}><RotateCcw className="size-4" /></button></div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <button className={`${buttonBase} border-fault/40 text-fault hover:bg-fault/10`} onClick={() => publish(TOPICS.stage1Line, "stage one line fault committed")}><CircleAlert className="size-4" />Stage 1 fault</button>
                <button className={`${buttonBase} hover:bg-muted`} onClick={() => publish(TOPICS.stage1Line, "clear")}><Check className="size-4 text-ok" />Clear stage 1</button>
                <button className={`${buttonBase} border-fault/40 text-fault hover:bg-fault/10`} onClick={() => publish(TOPICS.stage2Line, "stage two line fault committed")}><CircleAlert className="size-4" />Stage 2 fault</button>
                <button className={`${buttonBase} hover:bg-muted`} onClick={() => publish(TOPICS.stage2Line, "clear")}><Check className="size-4 text-ok" />Clear stage 2</button>
                <button className={`${buttonBase} border-ok/40 text-ok hover:bg-ok/10`} onClick={() => publish(TOPICS.stageSwitch, "high")}><Waves className="size-4" />Sensor high</button>
                <button className={`${buttonBase} hover:bg-muted`} onClick={() => publish(TOPICS.stageSwitch, "low")}><Gauge className="size-4" />Sensor low</button>
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className={`rounded-lg border p-4 ${state.faults ? "border-fault/40 bg-fault/5" : "bg-card"}`}>
              <div className="flex items-center justify-between"><h2 className="text-xs font-bold uppercase text-muted-foreground">Line deductions</h2><CircleAlert className={`size-4 ${state.faults ? "text-fault" : "text-muted-foreground"}`} /></div>
              <div className="mt-4 flex items-end justify-between border-b pb-4"><div><p className="font-display text-3xl font-bold">-{state.faults * FAULT_PENALTY}</p><p className="text-xs text-muted-foreground">Total marks</p></div><p className="text-sm font-bold text-fault">-{FAULT_PENALTY} / fault</p></div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">Only a line-touch fault deducts marks. The ultrasonic stage switch never affects the score.</p>
            </section>

            <section className="rounded-lg border bg-card p-4">
              <div className="mb-3 flex items-center justify-between"><h2 className="text-xs font-bold uppercase">System event log</h2><span className="font-mono text-[10px] text-muted-foreground">LIVE</span></div>
              {state.events.length ? <ul className="max-h-[470px] overflow-auto">{state.events.map((event) => <EventRow key={event.id} event={event} />)}</ul> : <div className="flex min-h-48 flex-col items-center justify-center text-center"><Radio className="mb-3 size-6 text-muted-foreground" /><p className="text-sm font-semibold">Listening for messages</p><p className="mt-1 text-xs text-muted-foreground">Sensor events will appear here.</p></div>}
            </section>
          </aside>
        </div>
        <footer className="mt-5 border-t pt-4 font-mono text-[10px] text-muted-foreground">TOPICS · {Object.values(TOPICS).join("  /  ")}</footer>
      </div>
    </main>
  );
}