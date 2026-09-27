<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep runtime competition state in memory only; the FastAPI MQTT bridge is the sole live-state authority because this is a presentation system without persistence.
- Keep MQTT topics fixed as `bike/stage_switching` and `bike/line_violation`; only connection settings vary so ESP32, backend, and dashboard stay compatible.
- Accept real sensor events only as per-device HMAC-SHA256 signed JSON with timestamp and nonce validation because field devices must resist spoofing and replay.
- Generate presentation layouts server-side through Lovable AI and apply only validated layout tokens; never send MQTT credentials or device secrets.
- Keep the operator's run label and display preference in browser session memory only because presentation preferences are intentionally non-persistent.
