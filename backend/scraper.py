"""
Scraper de la RFCYLF para el C.D. Latino Kukuli.

Solo usa la librería estándar de Python (no hace falta pip install).

Fuentes que se consultan:
  1. Ficha del equipo en el grupo (URL oficial del README): datos del grupo,
     fila del equipo y todos sus partidos con fecha, hora y resultado.
  2. NFG_VisClasificacion?codjornada=N : resultados de TODOS los partidos de
     la jornada N (la federación no publica la tabla de clasificación de
     fútbol base, así que se calcula a partir de estos resultados).
  3. NFG_CmpJornada?CodJornada=N : campo de juego, fecha/hora y escudos de
     cada partido de la jornada N.

Uso por línea de comandos:
    python backend/scraper.py            -> imprime el JSON
    python backend/scraper.py salida.json
"""

from __future__ import annotations

import html
import http.cookiejar
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, date

BASE = "https://www.rfcylf.es/pnfg/NPcd/"

# --- Configuración del equipo / grupo --------------------------------------
COD_EQUIPO = "22910498"
COD_GRUPO = "24219190"
TEAM_URL = (
    BASE + "NFG_VisCompeticiones_Grupo?&cod_primaria=1000123"
    f"&codequipo={COD_EQUIPO}&codgrupo={COD_GRUPO}"
)
RESULTS_URL = BASE + "NFG_VisClasificacion?cod_primaria=1000120&codgrupo={g}&codcompeticion=&codjornada={j}"
JORNADA_URL = BASE + "NFG_CmpJornada?cod_primaria=1000120&CodCompeticion=&CodGrupo={g}&CodTemporada=&CodJornada={j}"

# Identificación ante la federación. Si defines la variable de entorno CONTACTO
# (p. ej. el correo del club), se añade para que puedan contactar en vez de bloquear.
_CONTACTO = os.environ.get("CONTACTO", "").strip()
USER_AGENT = "Mozilla/5.0 (compatible; LatinoKukuliWeb/1.0" + (f"; +{_CONTACTO}" if _CONTACTO else "") + ")"
REQUEST_DELAY = 10.0      # segundos entre peticiones (la federación bloquea si vas rápido)
MAX_EXTRA_REQUESTS = 5    # peticiones máximas por actualización, además de la ficha del equipo
UPCOMING_DETAIL = 2       # nº de próximos partidos del equipo de los que se consulta el campo
TIMEOUT = 25


class ScrapeError(Exception):
    pass


# --- HTTP --------------------------------------------------------------------
def _opener():
    # La web exige una cookie de sesión: sin ella responde "No se ha aceptado el cookie".
    jar = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    op.addheaders = [("User-Agent", USER_AGENT), ("Accept-Language", "es-ES,es;q=0.9")]
    return op


def fetch(opener, url: str) -> str:
    with opener.open(url, timeout=TIMEOUT) as r:
        raw = r.read()
    text = raw.decode("iso-8859-15", errors="replace")
    if "No se ha aceptado el cookie" in text and len(text) < 500:
        # Primera petición: el servidor fija la cookie; reintentamos una vez.
        with opener.open(url, timeout=TIMEOUT) as r:
            text = r.read().decode("iso-8859-15", errors="replace")
    if len(text.strip()) < 300:
        raise ScrapeError("La federación ha devuelto una página vacía (posible bloqueo temporal por exceso de peticiones)")
    return re.sub(r"<script.*?</script>", "", text, flags=re.S | re.I)


# --- Utilidades de parseo ----------------------------------------------------
def clean(fragment: str) -> str:
    """Quita etiquetas, decodifica entidades y normaliza espacios."""
    txt = re.sub(r"<[^>]+>", " ", fragment)
    txt = html.unescape(txt).replace("\xa0", " ")
    return re.sub(r"\s+", " ", txt).strip()


def to_int(s: str):
    try:
        return int(s)
    except (TypeError, ValueError):
        return None


def parse_date(s: str):
    """'20-09-2026' -> '2026-09-20'"""
    m = re.search(r"(\d{2})-(\d{2})-(\d{4})", s or "")
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


def parse_time(s: str):
    m = re.search(r"\b(\d{1,2}:\d{2})\b", s or "")
    return m.group(1).zfill(5) if m else None


def norm(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "")).strip().lower()


# --- 1. Ficha del equipo -----------------------------------------------------
def parse_team_page(page: str) -> dict:
    info = {}
    m = re.search(r"la_roja_regular_titulo1>(.*?)</h4>\s*<h5>(.*?)</h5>", page, re.S)
    if not m:
        raise ScrapeError("No se encontró la cabecera del equipo (¿ha cambiado el HTML?)")
    info["team"] = clean(m.group(1))
    h5 = m.group(2)
    parts = [clean(p) for p in re.split(r"<br\s*/?>", h5)]
    info["competition"] = parts[0] if parts else ""
    for p in parts[1:]:
        if p.lower().startswith("grupo"):
            info["group"] = p.split(":", 1)[-1].strip()
        elif p.lower().startswith("temporada"):
            info["season"] = p.replace("Temporada", "").strip()

    tables = re.findall(r"<table.*?</table>", page, re.S)
    if len(tables) < 2:
        raise ScrapeError("No se encontraron las tablas de la ficha del equipo")

    # Fila del equipo en la tabla "Clasificación" (posición, puntos, J, casa G/E/P, fuera G/E/P, GF, GC, sanción)
    row_stats = None
    for tr in re.findall(r"<tr>(.*?)</tr>", tables[0], re.S):
        tds = [clean(td) for td in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if len(tds) >= 13 and tds[0].isdigit():
            n = [to_int(x) for x in tds]
            row_stats = {
                "position": n[0], "team": tds[1], "points": n[2], "played": n[3],
                "won": (n[4] or 0) + (n[7] or 0), "drawn": (n[5] or 0) + (n[8] or 0),
                "lost": (n[6] or 0) + (n[9] or 0), "gf": n[10], "ga": n[11], "sanction": n[12],
            }
            break
    info["official_row"] = row_stats

    # Partidos del equipo
    matches = []
    for tr in re.findall(r"<tr>(.*?)</tr>", tables[1], re.S):
        tds = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
        if len(tds) < 3:
            continue
        jornada = to_int(clean(tds[0]))
        h5s = re.findall(r"<h5[^>]*>(.*?)</h5>", tds[1], re.S)
        if jornada is None or len(h5s) < 3:
            continue
        score = re.findall(r"<b>\s*(\d+)\s*</b>", tds[2])
        result_flag = re.search(r'title=["\']?(\w+)', tds[2])
        matches.append({
            "jornada": jornada,
            "home": clean(h5s[0]),
            "away": clean(h5s[1]),
            "home_retired": "retirado" in h5s[0].lower(),
            "away_retired": "retirado" in h5s[1].lower(),
            "date": parse_date(clean(h5s[2])),
            "time": parse_time(clean(h5s[2])),
            "home_goals": to_int(score[0]) if len(score) == 2 else None,
            "away_goals": to_int(score[1]) if len(score) == 2 else None,
            "outcome": result_flag.group(1) if result_flag else None,  # Ganado / Empatado / Perdido
        })
    if not matches:
        raise ScrapeError("No se encontraron partidos del equipo")
    info["matches"] = matches
    return info


# --- 2. Resultados de una jornada ---------------------------------------------
TEAM_LINK = re.compile(r'Codigo_Equipo=(\d+)"[^>]*>(.*?)</a>(.*?)</h4>', re.S)


def parse_results_page(page: str) -> list[dict]:
    out = []
    for tr in re.findall(r"<tr>(.*?)</tr>", page, re.S):
        teams = TEAM_LINK.findall(tr)
        if len(teams) != 2:
            continue
        score = re.findall(r"<b>\s*(\d+)\s*</b>", tr)
        out.append({
            "home_id": teams[0][0], "home": clean(teams[0][1]),
            "away_id": teams[1][0], "away": clean(teams[1][1]),
            "home_retired": "retirado" in teams[0][2].lower(),
            "away_retired": "retirado" in teams[1][2].lower(),
            "home_goals": to_int(score[0]) if len(score) >= 2 else None,
            "away_goals": to_int(score[1]) if len(score) >= 2 else None,
        })
    return out


# --- 3. Detalle de jornada (campo, horario, escudos) --------------------------
def parse_jornada_page(page: str) -> list[dict]:
    out = []
    chunks = page.split('<tr style="background-color: #ffffff00;">')[1:]
    for ch in chunks:
        teams = re.findall(r'Codigo_Equipo=(\d+)"[^>]*>(.*?)</a>', ch, re.S)
        if len(teams) < 2:
            continue
        crests = re.findall(r'<img src="([^"]+)"[^>]*escudo_widget2', ch)
        horario = [clean(x) for x in re.findall(r"class=horario[^>]*>(.*?)</span>", ch, re.S)]
        campo = re.search(r'Codigo_Campo=(\d+)"[^>]*>(.*?)</a>', ch, re.S)
        out.append({
            "home_id": teams[0][0], "home": clean(teams[0][1]),
            "away_id": teams[1][0], "away": clean(teams[1][1]),
            "home_crest": crests[0] if len(crests) > 0 else None,
            "away_crest": crests[1] if len(crests) > 1 else None,
            "date": parse_date(" ".join(horario)),
            "time": parse_time(" ".join(horario)),
            "venue": clean(campo.group(2)) if campo else None,
            "venue_url": (BASE + "NFG_VisCampos?cod_primaria=1000122&Codigo_Campo=" + campo.group(1)) if campo else None,
        })
    return out


# --- Clasificación calculada --------------------------------------------------
def compute_standings(all_matches: list[dict], retired: set[str]) -> list[dict]:
    table: dict[str, dict] = {}

    def row(name):
        key = norm(name)
        if key not in table:
            table[key] = {"team": name, "played": 0, "won": 0, "drawn": 0, "lost": 0,
                          "gf": 0, "ga": 0, "points": 0, "retired": key in retired}
        return table[key]

    for m in all_matches:
        h, a = row(m["home"]), row(m["away"])
        hg, ag = m.get("home_goals"), m.get("away_goals")
        if hg is None or ag is None:
            continue
        for r, f, c in ((h, hg, ag), (a, ag, hg)):
            r["played"] += 1
            r["gf"] += f
            r["ga"] += c
            if f > c:
                r["won"] += 1; r["points"] += 3
            elif f == c:
                r["drawn"] += 1; r["points"] += 1
            else:
                r["lost"] += 1

    rows = list(table.values())
    for r in rows:
        r["gd"] = r["gf"] - r["ga"]
    rows.sort(key=lambda r: (r["retired"], -r["points"], -r["gd"], -r["gf"], r["team"]))
    for i, r in enumerate(rows, 1):
        r["position"] = i
    return rows


# --- Orquestador (incremental) -----------------------------------------------
def _merge_jornada(number, details, results, team_m, prev_matches):
    """Combina detalle (campo/horario), resultados y datos previos de una jornada."""
    by_pair = {}
    for m in prev_matches or []:
        by_pair[(norm(m["home"]), norm(m["away"]))] = dict(m)
    for d in details:
        key = (norm(d["home"]), norm(d["away"]))
        base = by_pair.get(key, {"home_goals": None, "away_goals": None,
                                 "home_retired": False, "away_retired": False})
        by_pair[key] = {**base, **{k: v for k, v in d.items() if v is not None or k not in base}}
    for r in results:
        key = (norm(r["home"]), norm(r["away"]))
        base = by_pair.get(key, {"date": None, "time": None, "venue": None, "venue_url": None,
                                 "home_crest": None, "away_crest": None})
        by_pair[key] = {**base, **r}
    if team_m:
        key = (norm(team_m["home"]), norm(team_m["away"]))
        base = by_pair.get(key, {"venue": None, "venue_url": None, "home_crest": None, "away_crest": None})
        merged = {**base}
        for k in ("home", "away", "date", "time", "home_retired", "away_retired"):
            if team_m.get(k) is not None:
                merged[k] = team_m[k]
        if team_m.get("home_goals") is not None:
            merged["home_goals"], merged["away_goals"] = team_m["home_goals"], team_m["away_goals"]
        merged.setdefault("home_goals", None); merged.setdefault("away_goals", None)
        by_pair[key] = merged
    return list(by_pair.values())


def scrape(previous: dict | None = None, progress=None) -> dict:
    """
    Descarga los datos haciendo el MÍNIMO de peticiones posible.

    La web de la federación bloquea temporalmente la IP si recibe muchas
    peticiones seguidas, así que:
      - Las jornadas cuyos resultados ya están completos en `previous` no se
        vuelven a pedir nunca.
      - El campo de juego solo se consulta para los próximos partidos del equipo.
      - Como máximo MAX_EXTRA_REQUESTS peticiones por ejecución; lo que falte se
        completa en la siguiente actualización.
    """
    op = _opener()
    log = progress or (lambda *_: None)
    previous = previous or {}
    prev_j = {j["number"]: j for j in previous.get("jornadas", [])}
    today = date.today().isoformat()

    log("Ficha del equipo")
    team = parse_team_page(fetch(op, TEAM_URL))
    total = max(m["jornada"] for m in team["matches"])
    team_by_j = {m["jornada"]: m for m in team["matches"]}

    upcoming = sorted(j for j, m in team_by_j.items() if (m["date"] or "9999") >= today)[:UPCOMING_DETAIL]
    budget = MAX_EXTRA_REQUESTS
    pending = False
    jornadas = []

    for j in range(1, total + 1):
        tm = team_by_j.get(j)
        prev = prev_j.get(j, {})
        prev_matches = prev.get("matches", [])
        jdate = (tm or {}).get("date") or prev.get("date")
        played = jdate is not None and jdate <= today
        complete = prev.get("complete", False)

        details, results = [], []
        if played and not complete:
            if budget > 0:
                budget -= 1
                time.sleep(REQUEST_DELAY)
                log(f"Resultados jornada {j}")
                results = parse_results_page(fetch(op, RESULTS_URL.format(g=COD_GRUPO, j=j)))
            else:
                pending = True
        if j in upcoming:
            if budget > 0:
                budget -= 1
                time.sleep(REQUEST_DELAY)
                log(f"Campos jornada {j}")
                details = parse_jornada_page(fetch(op, JORNADA_URL.format(g=COD_GRUPO, j=j)))
            else:
                pending = True

        matches = _merge_jornada(j, details, results, tm, prev_matches)
        is_complete = played and len(matches) > 1 and all(
            m["home_goals"] is not None or m.get("home_retired") or m.get("away_retired") for m in matches)
        jornadas.append({"number": j, "date": jdate, "matches": matches,
                         "complete": bool(complete or (is_complete and results))})

    retired = set()
    for m in [*team["matches"], *(m for jd in jornadas for m in jd["matches"])]:
        if m.get("home_retired"): retired.add(norm(m["home"]))
        if m.get("away_retired"): retired.add(norm(m["away"]))

    all_matches = [m for jd in jornadas for m in jd["matches"]]
    standings = compute_standings(all_matches, retired)
    missing = [jd["number"] for jd in jornadas if jd["date"] and jd["date"] <= today and not jd["complete"]]

    crest = previous.get("team_crest")
    for m in all_matches:
        if norm(m["home"]) == norm(team["team"]) and m.get("home_crest"):
            crest = m["home_crest"]; break
        if norm(m["away"]) == norm(team["team"]) and m.get("away_crest"):
            crest = m["away_crest"]; break

    return {
        "team": team["team"],
        "team_crest": crest,
        "competition": team.get("competition"),
        "group": team.get("group"),
        "season": team.get("season"),
        "official_row": team.get("official_row"),
        "standings": standings,
        "standings_source": "calculada",
        "standings_incomplete_jornadas": missing,
        "pending": pending or bool(missing),
        "jornadas": jornadas,
        "source_url": TEAM_URL,
        "updated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
    }


if __name__ == "__main__":
    prev = None
    if len(sys.argv) > 1:
        try:
            with open(sys.argv[1], encoding="utf-8") as f:
                prev = json.load(f)
        except (OSError, ValueError):
            pass
    data = scrape(prev, progress=lambda msg: print("·", msg, file=sys.stderr))
    out = json.dumps(data, ensure_ascii=False, indent=2)
    if len(sys.argv) > 1:
        with open(sys.argv[1], "w", encoding="utf-8") as f:
            f.write(out)
        print("Guardado en", sys.argv[1], file=sys.stderr)
    else:
        print(out)
