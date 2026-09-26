import { createFileRoute } from "@tanstack/react-router";
import { CircleAlert, Radio, RefreshCw } from "lucide-react";
import { FAULT_PENALTY, START_MARKS, useField, type FieldEvent } from "@/lib/field-mqtt";

export const Route = createFileRoute("/feedback")({
  head: () => ({
    meta: [
      { title: "Feedback | Field Command" },
      { name: "description", content: "Score breakdown, per-stage deductions and the live event log of the current run." },
      { property: "og:title", content: "Feedback | Field Command" },
      { property: "og:description", content: "Score breakdown and live event log." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Feedback,
});

function Feedback() {
  const { state, reset } = useField();
  const grade = state.marks >= 90 ? "Excellent" : state.marks >= 70 ? "Good" : state.marks >= 50 ? "Fair" : "Needs practice";
  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <div className="space-y-5">
        <section className="rounded-lg border bg-card p-6 text-center">
          <p className="text-xs font-bold uppercase text-muted-foreground">Final score</p>
          <h1 className="mt-2 font-display text-7xl font-bold">{state.marks}<span className="text-2xl text-muted-foreground">/{START_MARKS}</span></h1>
          <p className="mt-2 font-semibold text-ok">{grade}</p>
          <button onClick={reset} className="mt-5 inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted"><RefreshCw className="size-4" />New run</button>
        </section>
        <section className="rounded-lg border bg-card p-5">
          <h2 className="text-xs font-bold uppercase text-muted-foreground">Deductions by stage</h2>
          {[1, 2].map((s) => {
            const n = s === 1 ? state.stage1Faults : state.stage2Faults;
            return (
              <div key={s} className="mt-4 flex items-center justify-between border-b pb-3 last:border-0">
                <div><p className="font-semibold">Stage {s}</p><p className="text-xs text-muted-foreground">{n} violation{n === 1 ? "" : "s"}</p></div>
                <p className={`font-display text-2xl font-bold ${n ? "text-fault" : "text-ok"}`}>−{n * FAULT_PENALTY}</p>
              </div>
            );
          })}
          <p className="mt-4 text-xs leading-5 text-muted-foreground">Only line violations deduct marks ({FAULT_PENALTY} each). The ultrasonic stage switch never affects the score.</p>
        </section>
      </div>
      <section className="rounded-lg border bg-card p-5">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-xs font-bold uppercase">Live event log</h2><span className="font-mono text-[10px] text-muted-foreground">{state.events.length} events · not stored</span></div>
        {state.events.length ? (
          <ul className="max-h-[640px] overflow-auto">{state.events.map((e) => <Row key={e.id} e={e} />)}</ul>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center text-center"><Radio className="mb-3 size-6 text-muted-foreground" /><p className="font-semibold">Listening for sensors</p><p className="text-xs text-muted-foreground">Events appear here in real time.</p></div>
        )}
      </section>
    </div>
  );
}

function Row({ e }: { e: FieldEvent }) {
  const tone = e.kind === "fault" ? "text-fault" : e.kind === "switch" ? "text-ok" : "text-muted-foreground";
  const Icon = e.kind === "fault" ? CircleAlert : e.kind === "switch" ? RefreshCw : Radio;
  return (
    <li className="grid grid-cols-[80px_20px_1fr] gap-2 border-b py-2.5 text-sm last:border-0">
      <time className="font-mono text-xs text-muted-foreground">{new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
      <Icon className={`size-4 ${tone}`} />
      <div className="min-w-0"><p className={`font-semibold ${tone}`}>{e.message}</p><p className="truncate font-mono text-[10px] text-muted-foreground">{e.topic}{e.device ? ` · ${e.device}` : ""}</p></div>
    </li>
  );
}
