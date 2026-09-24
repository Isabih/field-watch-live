import { Link, Outlet } from "@tanstack/react-router";
import { Antenna, MonitorPlay, ClipboardList, Settings } from "lucide-react";
import { FieldContext, useFieldMonitorInternal } from "@/lib/field-mqtt";

const nav = [
  { to: "/", label: "Live View", icon: MonitorPlay },
  { to: "/feedback", label: "Feedback", icon: ClipboardList },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell() {
  const monitor = useFieldMonitorInternal();
  const { link, state } = monitor;
  const pill =
    link === "online" && state.mqttConnected
      ? { t: "Live · sensors connected", c: "border-ok/40 bg-ok/10 text-ok" }
      : link === "online"
        ? { t: "Server online · waiting for sensor hub", c: "border-caution/40 bg-caution/10 text-caution" }
        : { t: "Demo mode · server offline", c: "border-border bg-card text-muted-foreground" };

  return (
    <FieldContext.Provider value={monitor}>
      <div className="dark min-h-screen bg-background text-foreground">
        <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
          <div className="mx-auto flex max-w-[1480px] flex-wrap items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg border bg-card text-caution"><Antenna className="size-5" /></div>
              <div>
                <p className="font-display text-lg font-bold leading-tight">Field Command</p>
                <p className="text-[11px] text-muted-foreground">Bike stage & line monitoring</p>
              </div>
            </div>
            <nav className="order-3 flex w-full gap-1 rounded-lg border bg-card p-1 md:order-none md:ml-6 md:w-auto">
              {nav.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  activeOptions={{ exact: true }}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground md:flex-none"
                  activeProps={{ className: "bg-muted text-foreground" }}
                >
                  <Icon className="size-4" />{label}
                </Link>
              ))}
            </nav>
            <div className={`ml-auto flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${pill.c}`}>
              <span className={`size-2 rounded-full ${link === "online" && state.mqttConnected ? "bg-ok animate-beacon" : "bg-current"}`} />
              {pill.t}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </FieldContext.Provider>
  );
}
