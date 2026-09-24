"""
Field Command backend — FastAPI + MQTT bridge. No database: state lives in memory only.

ESP32 publishes payload "1" on:
  bike/stage_switching  -> stage 1 ends, stage 2 becomes active (never deducts)
  bike/line_violation   -> line fault in the current stage, -5 marks
The backend keeps its state when no message is received.

Run:  uvicorn main:app --host 0.0.0.0 --port 8000
"""
import asyncio
import json
import os
import time
import uuid
from typing import Optional

import paho.mqtt.client as mqtt
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

TOPIC_STAGE = "bike/stage_switching"
TOPIC_LINE = "bike/line_violation"
START_MARKS = 100
FAULT_PENALTY = 5

config = {
    "host": os.getenv("MQTT_HOST", "localhost"),
    "port": int(os.getenv("MQTT_PORT", "1884")),
    "username": os.getenv("MQTT_USER", ""),
    "password": os.getenv("MQTT_PASSWORD", ""),
}


def fresh_state() -> dict:
    return {
        "activeStage": 1, "marks": START_MARKS, "faults": 0,
        "stage1Faults": 0, "stage2Faults": 0,
        "lastLineAt": None, "lastStageAt": None, "events": [],
    }


state = fresh_state()
mqtt_connected = False
clients: set[WebSocket] = set()
loop: Optional[asyncio.AbstractEventLoop] = None
mqttc: Optional[mqtt.Client] = None


def snapshot() -> dict:
    return {**state, "mqttConnected": mqtt_connected, "mqttHost": config["host"], "mqttPort": config["port"]}


async def broadcast():
    data = json.dumps(snapshot())
    for ws in list(clients):
        try:
            await ws.send_text(data)
        except Exception:
            clients.discard(ws)


def schedule_broadcast():
    if loop:
        asyncio.run_coroutine_threadsafe(broadcast(), loop)


def handle(topic: str, payload: str):
    if payload.strip() != "1":
        return
    now = int(time.time() * 1000)
    stage = state["activeStage"]
    if topic == TOPIC_LINE:
        state["marks"] = max(0, state["marks"] - FAULT_PENALTY)
        state["faults"] += 1
        state[f"stage{stage}Faults"] += 1
        state["lastLineAt"] = now
        ev = {"kind": "fault", "stage": stage, "message": f"Line violation in stage {stage} · -{FAULT_PENALTY} marks"}
    elif topic == TOPIC_STAGE:
        msg = "Stage 1 ended · Stage 2 active" if stage == 1 else "Object detected · already in stage 2"
        state["activeStage"] = 2
        state["lastStageAt"] = now
        ev = {"kind": "switch", "stage": 2, "message": msg}
    else:
        return
    state["events"] = ([{"id": uuid.uuid4().hex, "at": now, "topic": topic, **ev}] + state["events"])[:100]
    print(f"[{topic}] {ev['message']}  marks={state['marks']}")
    schedule_broadcast()


def on_connect(client, userdata, flags, rc, properties=None):
    global mqtt_connected
    mqtt_connected = rc == 0
    print("MQTT connected" if mqtt_connected else f"MQTT connect failed rc={rc}")
    if mqtt_connected:
        client.subscribe([(TOPIC_STAGE, 0), (TOPIC_LINE, 0)])
    schedule_broadcast()


def on_disconnect(client, userdata, *args):
    global mqtt_connected
    mqtt_connected = False
    schedule_broadcast()


def on_message(client, userdata, msg):
    handle(msg.topic, msg.payload.decode(errors="ignore"))


def start_mqtt():
    global mqttc, mqtt_connected
    if mqttc:
        mqttc.loop_stop()
        try:
            mqttc.disconnect()
        except Exception:
            pass
    mqtt_connected = False
    try:
        c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"field-backend-{uuid.uuid4().hex[:6]}")
    except AttributeError:  # paho < 2.0
        c = mqtt.Client(client_id=f"field-backend-{uuid.uuid4().hex[:6]}")
    if config["username"]:
        c.username_pw_set(config["username"], config["password"])
    c.on_connect, c.on_disconnect, c.on_message = on_connect, on_disconnect, on_message
    c.reconnect_delay_set(1, 5)
    c.connect_async(config["host"], config["port"], keepalive=30)
    c.loop_start()
    mqttc = c
    print(f"Connecting to MQTT {config['host']}:{config['port']} ...")


app = FastAPI(title="Field Command backend")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup():
    global loop
    loop = asyncio.get_running_loop()
    start_mqtt()


@app.get("/state")
def get_state():
    return snapshot()


class Sim(BaseModel):
    topic: str


@app.post("/simulate")
def simulate(body: Sim):
    handle(body.topic, "1")
    return snapshot()


@app.post("/reset")
async def reset():
    global state
    state = fresh_state()
    await broadcast()
    return snapshot()


class Cfg(BaseModel):
    host: str
    port: int = 1884
    username: str = ""
    password: str = ""


@app.post("/config")
async def set_config(body: Cfg):
    config.update(host=body.host, port=body.port)
    if body.username:
        config.update(username=body.username, password=body.password)
    start_mqtt()
    await broadcast()
    return {"ok": True}


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    clients.add(ws)
    await ws.send_text(json.dumps(snapshot()))
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        clients.discard(ws)
