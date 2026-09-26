import { createFileRoute } from "@tanstack/react-router";
import { CircleAlert, RotateCcw, Server, Waves } from "lucide-react";
import { useEffect, useState } from "react";
import { FAULT_PENALTY, TOPICS, useField } from "@/lib/field-mqtt";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings & Configuration | Field Command" },
      { name: "description", content: "Configure the server address and MQTT broker IP, view fixed topics and run test signals." },
      { property: "og:title", content: "Settings & Configuration | Field Command" },
      { property: "og:description", content: "Server, MQTT broker and test controls." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

const btn = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors disabled:opacity-50";

function SettingsPage() {
  const { backend, setBackend, state, link, simulate, reset, configureMqtt } = useField();
  const [be, setBe] = useState(backend);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("1884");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => setBe(backend), [backend]);
  useEffect(() => {
    if (state.mqttHost && !host) setHost(state.mqttHost);
  }, [state.mqttHost, host]);

  const saveMqtt = async () => {
    setMsg("Connecting…");
    try {
      await configureMqtt(host.trim(), Number(port) || 1884, user, pass);
      setMsg("Saved. The server is connecting to the broker.");
    } catch {
      setMsg("Could not reach the server. Start it first (see guide below).");
    }
  };

  const input = "mt-1 w-full rounded-lg border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-ok";
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-lg border bg-card p-5">
        <h1 className="flex items-center gap-2 font-display text-lg font-bold"><Server className="size-5 text-ok" />Server address</h1>
        <p className="mt-1 text-xs text-muted-foreground">Where the Python backend runs. Status: <b className={link === "online" ? "text-ok" : "text-muted-foreground"}>{link}</b></p>
        <input className={input} value={be} onChange={(e) => setBe(e.target.value)} />
        <button className={`${btn} mt-3 border-ok bg-ok text-ok-foreground`} onClick={() => setBackend(be)}>Save & reconnect</button>
      </section>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-display text-lg font-bold">MQTT broker (only change the IP)</h2>
        <p className="mt-1 text-xs text-muted-foreground">Broker: <b className={state.mqttConnected ? "text-ok" : "text-caution"}>{state.mqttConnected ? `connected to ${state.mqttHost}:${state.mqttPort}` : "not connected"}</b></p>
        <div className="mt-2 grid grid-cols-[1fr_100px] gap-2">
          <label className="text-[10px] font-bold uppercase text-muted-foreground">IP address<input className={input} placeholder="192.168.1.50" value={host} onChange={(e) => setHost(e.target.value)} /></label>
          <label className="text-[10px] font-bold uppercase text-muted-foreground">Port<input className={input} value={port} onChange={(e) => setPort(e.target.value)} /></label>
          <label className="text-[10px] font-bold uppercase text-muted-foreground">Username<input className={input} value={user} onChange={(e) => setUser(e.target.value)} /></label>
          <label className="text-[10px] font-bold uppercase text-muted-foreground">Password<input type="password" className={input} value={pass} onChange={(e) => setPass(e.target.value)} /></label>
        </div>
        <button disabled={link !== "online" || !host} className={`${btn} mt-3 border-ok bg-ok text-ok-foreground`} onClick={saveMqtt}>Connect broker</button>
        {msg && <p className="mt-2 text-xs text-muted-foreground">{msg}</p>}
      </section>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-display text-lg font-bold">Fixed topics</h2>
        <p className="mt-1 text-xs text-muted-foreground">Same in the ESP32, the server and this app. Real devices send signed JSON; test signals are generated safely by the server.</p>
        <ul className="mt-3 space-y-2 font-mono text-sm">
          <li className="flex justify-between rounded border bg-background px-3 py-2"><span>{TOPICS.stage}</span><span className="text-ok">stage 1 → 2</span></li>
          <li className="flex justify-between rounded border bg-background px-3 py-2"><span>{TOPICS.line}</span><span className="text-fault">−{FAULT_PENALTY} mark</span></li>
        </ul>
      </section>

      <section className="rounded-lg border bg-card p-5">
        <div className="flex items-center justify-between"><h2 className="font-display text-lg font-bold">Test signals</h2><button onClick={reset} className={`${btn} hover:bg-muted`}><RotateCcw className="size-4" />Reset run</button></div>
        <p className="mt-1 text-xs text-muted-foreground">{link === "online" ? "Sent through the server, exactly like the ESP32." : "Server offline: runs as a local demo."}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button className={`${btn} border-ok/40 text-ok hover:bg-ok/10`} onClick={() => simulate(TOPICS.stage)}><Waves className="size-4" />Ultrasonic detects (1)</button>
          <button className={`${btn} border-fault/40 text-fault hover:bg-fault/10`} onClick={() => simulate(TOPICS.line)}><CircleAlert className="size-4" />Line violation (1)</button>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-5 lg:col-span-2">
        <h2 className="font-display text-lg font-bold">MacBook setup guide</h2>
        <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm leading-6">
          <li>Install Homebrew, then Mosquitto and Python:<Code>{`/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"\nbrew install mosquitto python`}</Code></li>
          <li>Make Mosquitto listen on port 1884 for the ESP32 with a user and password:<Code>{`mosquitto_passwd -c /opt/homebrew/etc/mosquitto/passwd myuser\ncat >> /opt/homebrew/etc/mosquitto/mosquitto.conf <<'EOF'\nlistener 1884 0.0.0.0\nallow_anonymous false\npassword_file /opt/homebrew/etc/mosquitto/passwd\nEOF\nbrew services restart mosquitto`}</Code></li>
          <li>Find your Mac IP (put it in the ESP32 as MQTT_SERVER and here):<Code>ipconfig getifaddr en0</Code></li>
          <li>Start the backend (folder <code>backend/</code> of this project):<Code>{`cd backend\npython3 -m venv .venv && source .venv/bin/activate\npip install -r requirements.txt\ncp .env.example .env   # set broker login and the same device secret used by ESP32\nuvicorn main:app --host 0.0.0.0 --port 8000`}</Code></li>
          <li>Start this app locally:<Code>{`npm install\nnpm run dev`}</Code>Open it, set Server address to <code>http://localhost:8000</code>.</li>
          <li>Flash your signed-payload ESP32 firmware with Arduino IDE. Set WiFi, broker IP, broker login, device ID, and the matching device secret.</li>
          <li>Use the Test signals above to present without the ESP32. Real MQTT messages must use the signed JSON payload produced by the ESP32.</li>
        </ol>
      </section>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return <pre className="my-2 overflow-x-auto rounded-lg border bg-background p-3 font-mono text-xs">{children}</pre>;
}
