"""
Servidor web + API para la web del C.D. Latino Kukuli.

    python backend/server.py            -> http://localhost:8000

Rutas:
  GET  /               -> la web (carpeta frontend/)
  GET  /api/data       -> datos en caché (JSON). Si la caché tiene más de
                          CACHE_TTL_HOURS, lanza una actualización en segundo
                          plano y devuelve al instante lo que hay guardado.
  POST /api/refresh    -> fuerza una actualización (con un tiempo mínimo
                          entre actualizaciones para no saturar la federación).

Si la federación está caída o cambia su HTML, se siguen sirviendo los últimos
datos guardados en data/cache.json y se informa del error en "meta.error".
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
import traceback
from datetime import datetime, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import scraper  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
CACHE_FILE = ROOT / "data" / "cache.json"

CACHE_TTL_HOURS = float(os.environ.get("CACHE_TTL_HOURS", 6))
MIN_REFRESH_MINUTES = float(os.environ.get("MIN_REFRESH_MINUTES", 10))
# Si la federación nos bloquea, no se vuelve a intentar hasta pasadas estas horas
# (se duplica en cada bloqueo seguido, hasta BLOCK_BACKOFF_MAX_HOURS).
BLOCK_BACKOFF_HOURS = float(os.environ.get("BLOCK_BACKOFF_HOURS", 6))
BLOCK_BACKOFF_MAX_HOURS = 48
PORT = int(os.environ.get("PORT", 8000))

_lock = threading.Lock()
_state = {"refreshing": False, "last_attempt": 0.0, "error": None, "error_at": None,
          "blocked_until": 0.0, "blocks_in_a_row": 0}


def load_cache() -> dict | None:
    try:
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def save_cache(data: dict) -> None:
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = CACHE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(CACHE_FILE)


def cache_age_hours(data: dict | None) -> float | None:
    if not data or not data.get("updated_at"):
        return None
    try:
        updated = datetime.fromisoformat(data["updated_at"])
    except ValueError:
        return None
    return (datetime.now(updated.tzinfo) - updated) / timedelta(hours=1)


def _refresh_worker():
    try:
        data = scraper.scrape(load_cache(), progress=lambda m: print("  ·", m))
        save_cache(data)
        _state["error"] = None
        _state["blocks_in_a_row"] = 0
        print("[ok] Datos actualizados", data["updated_at"])
    except Exception as exc:  # noqa: BLE001 - nunca tumbar el servidor
        _state["error"] = str(exc) or exc.__class__.__name__
        _state["error_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
        print("[error] No se pudo actualizar:", _state["error"])
        if "vacía" in _state["error"]:
            _state["blocks_in_a_row"] += 1
            hours = min(BLOCK_BACKOFF_HOURS * 2 ** (_state["blocks_in_a_row"] - 1), BLOCK_BACKOFF_MAX_HOURS)
            _state["blocked_until"] = time.time() + hours * 3600
            print(f"[pausa] Posible bloqueo de la federación: no se reintenta en {hours:g} h")
        traceback.print_exc()
    finally:
        _state["refreshing"] = False


def trigger_refresh(force: bool = False) -> str:
    with _lock:
        if _state["refreshing"]:
            return "en_curso"
        if time.time() < _state["blocked_until"]:
            return f"espera_{int((_state['blocked_until'] - time.time()) // 60) + 1}_min"
        wait = MIN_REFRESH_MINUTES * 60 - (time.time() - _state["last_attempt"])
        if wait > 0:
            return f"espera_{int(wait // 60) + 1}_min"
        _state["refreshing"] = True
        _state["last_attempt"] = time.time()
    threading.Thread(target=_refresh_worker, daemon=True).start()
    return "iniciada"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND), **kwargs)

    def _json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _payload(self, extra=None):
        data = load_cache()
        age = cache_age_hours(data)
        meta = {
            "refreshing": _state["refreshing"],
            "error": _state["error"],
            "error_at": _state["error_at"],
            "cache_age_hours": round(age, 2) if age is not None else None,
            "ttl_hours": CACHE_TTL_HOURS,
            "paused_until": datetime.fromtimestamp(_state["blocked_until"]).astimezone().isoformat(timespec="minutes")
                            if _state["blocked_until"] > time.time() else None,
            **(extra or {}),
        }
        return {"data": data, "meta": meta}

    def do_GET(self):
        if self.path.split("?")[0] == "/api/data":
            data = load_cache()
            age = cache_age_hours(data)
            if age is None or age > CACHE_TTL_HOURS or (data or {}).get("pending"):
                trigger_refresh()
            return self._json(self._payload())
        return super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] == "/api/refresh":
            status = trigger_refresh(force=True)
            return self._json(self._payload({"refresh": status}))
        self.send_error(404)

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)


def main():
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Latino Kukuli -> http://localhost:{PORT}  (caché {CACHE_TTL_HOURS} h, Ctrl+C para salir)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nAdiós")


if __name__ == "__main__":
    main()
