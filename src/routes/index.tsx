import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  DEFAULT_BROKER,
  FAULT_PENALTY,
  START_MARKS,
  TOPICS,
  useFieldMonitor,
} from "@/lib/field-mqtt";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Field Line Monitor | Live Stage & Fault Board" },
      {
        name: "description",
        content:
          "Live monitoring board for field line-touch sensors and ultrasonic stage switching, with fault indicators and marks deduction.",
      },
      { property: "og:title", content: "Field Line Monitor | Live Stage & Fault Board" },
      {
        property: "og:description",
        content:
          "Watch stage one and stage two line sensors in real time, with animated fault alarms and remaining marks.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type LaneProps = { stage: 1 | 2; active: boolean; fault: boolean };

function Lane({ stage, active, fault }: LaneProps) {
  const color = fault ? "var(--fault)" : active ? "var(--ok)" : "var(--idle)";
  return (
    <div className="relative">
      <div className="mb-2 flex items-center justify-between font-display text-sm uppercase tracking-[0.2em]">
        <span className="text-muted-foreground">Stage {stage} lane</span>
        <span style={{ color }}>
          {fault ? "Fault committed" : active ? "Active" : "Free"}
        </span>
      </div>
      <div
        className="relative h-28 overflow-hidden rounded-lg border"
        style={{
          backgroundColor: "var(--asphalt)",
          borderColor: active ? color : "var(--border)",
          boxShadow: active ? `0 0 26px -6px ${color}` : "none",
        }}
      >
        <div
          className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 opacity-40 animate-dash"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, var(--asphalt-line) 0 32px, transparent 32px 64px)",
          }}
        />
        <div
          className={`absolute inset-x-6 bottom-5 h-2 rounded-full ${fault ? "animate-alarm" : ""}`}
          style={{ backgroundColor: color, boxShadow: `0 0 18px 2px ${color}` }}
        />
        <div
          className="absolute bottom-3 left-4 font-display text-xs uppercase tracking-widest"
          style={{ color }}
        >
          Touch line {stage}
        </div>
      </div>
    </div>
  );
}

function Indicator({ label, on, tone }: { label: string; on: boolean; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
      <span className="relative flex h-4 w-4 items-center justify-center">
        {on && (
          <span
            className="absolute h-4 w-4 rounded-full animate-beacon"
            style={{ backgroundColor: tone }}
          />
        )}
        <span
          className={`h-4 w-4 rounded-full ${on ? "animate-alarm" : ""}`}
          style={{ backgroundColor: on ? tone : "var(--idle)" }}
        />
      </span>
      <span className="font-display text-sm uppercase tracking-[0.18em] text-foreground">
        {label}
      </span>
    </div>
  );
}

function Index() {
  const [brokerInput, setBrokerInput] = useState(DEFAULT_BROKER);
  const [broker, setBroker] = useState(DEFAULT_BROKER);
  const [nonce, setNonce] = useState(0);
  const { state, status, publish, reset } = useFieldMonitor(broker, nonce);

  const statusTone =
    status === "online" ? "var(--ok)" : status === "error" ? "var(--fault)" : "var(--asphalt-line)";

  return (
    <div className="dark min-h-screen bg-background px-5 py-8 text-foreground">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl uppercase tracking-[0.15em]">
              Field Line Monitor
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Live touch-line faults and ultrasonic stage switching.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border px-4 py-2 text-xs uppercase tracking-widest">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusTone }} />
            broker {status}
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-5">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Remaining marks
            </p>
            <p
              className="mt-1 font-display text-5xl"
              style={{ color: state.marks < START_MARKS / 2 ? "var(--fault)" : "var(--ok)" }}
            >
              {state.marks}
            </p>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Faults ({FAULT_PENALTY} marks each)
            </p>
            <p className="mt-1 font-display text-5xl">{state.faults}</p>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Active stage</p>
            <p className="mt-1 font-display text-5xl">Stage {state.activeStage}</p>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <Indicator label="Stage 1 fault" on={state.stage1Fault} tone="var(--fault)" />
          <Indicator label="Stage 2 fault" on={state.stage2Fault} tone="var(--fault)" />
          <Indicator
            label="Stage switch high"
            on={state.activeStage === 2}
            tone="var(--asphalt-line)"
          />
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 font-display text-lg uppercase tracking-[0.2em]">Virtual ground</h2>
          <div className="space-y-5">
            <Lane stage={1} active={state.activeStage === 1} fault={state.stage1Fault} />
            <Lane stage={2} active={state.activeStage === 2} fault={state.stage2Fault} />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            {state.activeStage === 1
              ? "Stage one running — stage two on standby."
              : "Stage one is free, stage two active."}
          </p>
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 font-display text-lg uppercase tracking-[0.2em]">
            Broker &amp; test controls
          </h2>
          <div className="flex flex-wrap gap-2">
            <input
              value={brokerInput}
              onChange={(e) => setBrokerInput(e.target.value)}
              className="min-w-[260px] flex-1 rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="wss://your-broker:8081"
            />
            <button
              onClick={() => {
                setBroker(brokerInput);
                setNonce((n) => n + 1);
              }}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Connect
            </button>
            <button onClick={reset} className="rounded-md border px-4 py-2 text-sm">
              Reset marks
            </button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              className="rounded-md border px-3 py-2 text-sm"
              onClick={() => publish(TOPICS.stage1Line, "stage one line fault committed")}
            >
              Send stage 1 fault (HIGH)
            </button>
            <button
              className="rounded-md border px-3 py-2 text-sm"
              onClick={() => publish(TOPICS.stage1Line, "clear")}
            >
              Clear stage 1
            </button>
            <button
              className="rounded-md border px-3 py-2 text-sm"
              onClick={() => publish(TOPICS.stage2Line, "stage two line fault committed")}
            >
              Send stage 2 fault (HIGH)
            </button>
            <button
              className="rounded-md border px-3 py-2 text-sm"
              onClick={() => publish(TOPICS.stage2Line, "clear")}
            >
              Clear stage 2
            </button>
            <button
              className="rounded-md border px-3 py-2 text-sm"
              onClick={() => publish(TOPICS.stageSwitch, "high")}
            >
              Stage switch HIGH (go stage 2)
            </button>
            <button
              className="rounded-md border px-3 py-2 text-sm"
              onClick={() => publish(TOPICS.stageSwitch, "low")}
            >
              Stage switch LOW (back to stage 1)
            </button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Topics: {Object.values(TOPICS).join(" · ")}
          </p>
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-3 font-display text-lg uppercase tracking-[0.2em]">Event log</h2>
          {state.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Waiting for sensor messages…</p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-auto text-sm">
              {state.events.map((e) => (
                <li key={e.id} className="flex gap-3 border-b border-border/50 py-1.5">
                  <span className="text-muted-foreground">
                    {new Date(e.at).toLocaleTimeString()}
                  </span>
                  <span
                    className="font-mono text-xs"
                    style={{
                      color: e.kind === "fault" ? "var(--fault)" : "var(--asphalt-line)",
                    }}
                  >
                    {e.topic}
                  </span>
                  <span className="text-foreground/90">{e.message}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
