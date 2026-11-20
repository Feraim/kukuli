/* Web del C.D. Latino Kukuli — lógica del frontend (sin dependencias) */
(() => {
  "use strict";

  // ---- Configuración --------------------------------------------------------
  const CONFIG = {
    displayName: "Latino Kukuli Salamanca",
    teamMatch: "latino kukuli",      // texto que identifica a nuestro equipo en los datos
    localCrest: "img/escudo.jpg",
    api: "api/data",            // con servidor propio (python backend/server.py)
    refreshApi: "api/refresh",
    staticData: "data.json",    // en GitHub Pages: archivo que genera la tarea automática
  };

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isUs = (name) => (name || "").toLowerCase().includes(CONFIG.teamMatch);
  const today = new Date().toISOString().slice(0, 10);

  let DATA = null;
  let usingMock = false;
  let staticMode = false;
  let filter = readPref("filter", "team");
  let showAllUpcoming = false;

  function readPref(k, def) { try { return localStorage.getItem("kukuli." + k) || def; } catch { return def; } }
  function writePref(k, v) { try { localStorage.setItem("kukuli." + k, v); } catch { /* sin almacenamiento */ } }

  // ---- Fechas ---------------------------------------------------------------
  const fmtDate = (iso, opts) => {
    if (!iso) return "Fecha por confirmar";
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-ES", opts || { weekday: "short", day: "numeric", month: "short" });
  };
  const daysUntil = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.round((new Date(y, m - 1, d) - t) / 86400000);
  };
  const relDay = (iso) => {
    if (!iso) return "";
    const n = daysUntil(iso);
    return n === 0 ? "¡Hoy!" : n === 1 ? "Mañana" : n > 1 ? `En ${n} días` : "";
  };

  // ---- Utilidades de render -------------------------------------------------
  const PREFIX = /^(c\.?d\.?|c\.?f\.?|u\.?d\.?|f\.?c\.?|s\.?d\.?|a\.?d\.?|e\.?f\.?|de|la|el)$/i;
  const initials = (name) => name.replace(/["“”]/g, " ").split(/[\s-]+/)
    .filter((w) => w && !PREFIX.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  // ---- Campos y Google Maps -------------------------------------------------
  // "C.M. Rosa Colorado 1.2" -> búsqueda "Campo Municipal Rosa Colorado, Salamanca"
  const mapsUrl = (venue) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(
    venue.replace(/^C\.?\s?M\.?\s+/i, "Campo Municipal ").replace(/\s+\d+(\.\d+)?$/, "").trim() + ", Salamanca");

  // Campo habitual de cada equipo cuando juega en casa (para partidos sin campo confirmado)
  let HOME_VENUES = {};
  function buildHomeVenues(d) {
    const count = {};
    for (const j of d.jornadas) for (const m of j.matches) {
      if (!m.venue) continue;
      (count[m.home] ||= {})[m.venue] = (count[m.home][m.venue] || 0) + 1;
    }
    HOME_VENUES = Object.fromEntries(Object.entries(count).map(([t, v]) => [t, Object.entries(v).sort((a, b) => b[1] - a[1])[0][0]]));
  }
  // Devuelve { name, confirmed } o null
  const venueFor = (m) => m.venue ? { name: m.venue, confirmed: true }
    : HOME_VENUES[m.home] ? { name: HOME_VENUES[m.home], confirmed: false } : null;

  function mapsButton(v, big) {
    return `<a class="maps-btn${big ? " maps-btn--big" : ""}" href="${esc(mapsUrl(v.name))}" target="_blank" rel="noopener" aria-label="Cómo llegar a ${esc(v.name)} en Google Maps">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg>
      Cómo llegar</a>`;
  }

  // Escudos conocidos por nombre de equipo (se reutilizan en todas las jornadas)
  let CRESTS = {};
  function buildCrests(d) {
    CRESTS = {};
    for (const j of d.jornadas) for (const m of j.matches) {
      if (m.home_crest) CRESTS[m.home] = m.home_crest;
      if (m.away_crest) CRESTS[m.away] = m.away_crest;
    }
  }

  function crestHTML(name, url) {
    const src = isUs(name) ? CONFIG.localCrest : (url || CRESTS[name]);
    if (src) return `<img class="crest" src="${esc(src)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'crest crest--fallback',textContent:'${esc(initials(name))}'}))">`;
    return `<span class="crest crest--fallback" aria-hidden="true">${esc(initials(name))}</span>`;
  }

  const played = (m) => m.home_goals != null && m.away_goals != null;

  function outcomeFor(m) {
    if (!played(m)) return null;
    const usHome = isUs(m.home);
    const [f, c] = usHome ? [m.home_goals, m.away_goals] : [m.away_goals, m.home_goals];
    return f > c ? "W" : f === c ? "D" : "L";
  }

  function matchHTML(m) {
    const ours = isUs(m.home) || isUs(m.away);
    const hw = played(m) && m.home_goals > m.away_goals;
    const aw = played(m) && m.away_goals > m.home_goals;
    const retiredMatch = m.home_retired || m.away_retired;
    let center;
    if (played(m)) center = `<span class="score">${m.home_goals} - ${m.away_goals}</span>`;
    else if (retiredMatch) center = `<span class="score score--time">—</span>`;
    else center = `<span class="score score--time">${esc(m.time || "--:--")}</span>`;

    const o = ours ? outcomeFor(m) : null;
    const badge = o ? `<span class="result-badge ${o}" title="${{ W: "Ganado", D: "Empatado", L: "Perdido" }[o]}">${{ W: "Ganado", D: "Empate", L: "Perdido" }[o]}</span>` : "";

    const meta = [];
    if (badge) meta.push(badge.replace("result-badge", "result-badge result-badge--meta"));
    if (m.date) meta.push(fmtDate(m.date));
    if (played(m) && m.time) meta.push(m.time);
    const v = !played(m) && !retiredMatch ? venueFor(m) : (m.venue ? { name: m.venue, confirmed: true } : null);
    if (v) meta.push(`📍 ${esc(v.name)}${v.confirmed ? "" : " <em>(campo habitual, por confirmar)</em>"}`);
    const maps = v && !played(m) && !retiredMatch ? `<div class="match__actions">${mapsButton(v)}</div>` : "";
    if (retiredMatch) meta.push(`<span class="retired">Equipo retirado</span>`);

    return `<div class="match${ours ? " is-ours" : ""}">
      <div class="match__row">
        <div class="match__team match__team--home${isUs(m.home) ? " is-us" : ""}${hw ? " is-winner" : ""}"><span>${esc(m.home)}</span>${crestHTML(m.home, m.home_crest)}</div>
        ${center}
        <div class="match__team${isUs(m.away) ? " is-us" : ""}${aw ? " is-winner" : ""}">${crestHTML(m.away, m.away_crest)}<span>${esc(m.away)}</span></div>
      </div>
      ${meta.length ? `<div class="match__meta">${meta.join(" · ")}</div>` : ""}
      ${maps}
    </div>`;
  }

  function jornadaHTML(j, matches) {
    return `<article class="jornada">
      <header class="jornada__head"><strong>Jornada ${j.number}</strong><span>${esc(fmtDate(j.date, { day: "numeric", month: "long", year: "numeric" }))}</span></header>
      ${matches.map(matchHTML).join("")}
    </article>`;
  }

  // ---- Secciones ------------------------------------------------------------
  function renderHeader(d) {
    $("#club-name").textContent = CONFIG.displayName;
    $("#club-meta").textContent = [d.competition, d.group, d.season && `Temporada ${d.season}`].filter(Boolean).join(" · ");

    const ourMatches = d.jornadas.flatMap((j) => j.matches.filter((m) => isUs(m.home) || isUs(m.away)));
    const next = ourMatches
      .filter((m) => !played(m) && m.date && m.date >= today && !m.home_retired && !m.away_retired)
      .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")))[0];

    const box = $("#next-match .next__body");
    box.classList.remove("skeleton");
    if (!next) {
      box.innerHTML = `<p>No hay partidos programados.</p>`;
    } else {
      const home = isUs(next.home);
      const nv = venueFor(next);
      box.innerHTML = `
        <div class="next__teams">
          <div class="next__team">${crestHTML(next.home, next.home_crest)}<span>${esc(next.home)}</span></div>
          <span class="next__vs">VS</span>
          <div class="next__team">${crestHTML(next.away, next.away_crest)}<span>${esc(next.away)}</span></div>
        </div>
        <div class="next__info">
          <span class="pill">${home ? "En casa" : "Fuera"}</span>
          <span class="next__when">${esc(fmtDate(next.date, { weekday: "long", day: "numeric", month: "long" }))}${next.time ? " · " + esc(next.time) + " h" : ""}</span>
          ${relDay(next.date) ? `<span>${relDay(next.date)}</span>` : ""}
          <span>${nv ? `📍 ${esc(nv.name)}${nv.confirmed ? "" : " (habitual, por confirmar)"}` : "📍 Campo por confirmar"}</span>
        </div>
        ${nv ? `<div class="next__actions">${mapsButton(nv, true)}</div>` : ""}`;
    }

    // Resumen del equipo (fila oficial de la federación, o la calculada)
    const r = d.official_row || d.standings.find((s) => isUs(s.team));
    const stats = $("#team-stats");
    if (r) {
      const items = [["Pos.", r.position], ["PJ", r.played], ["G", r.won], ["E", r.drawn], ["P", r.lost], ["Pts", r.points]];
      stats.innerHTML = items.map(([k, v]) => `<div><dt>${k}</dt><dd>${v ?? "–"}</dd></div>`).join("");
      stats.hidden = false;
    }
  }

  function renderMatches(d) {
    document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c.dataset.filter === filter));
    const pick = (j) => (filter === "team" ? j.matches.filter((m) => isUs(m.home) || isUs(m.away)) : j.matches);
    const sortMatches = (ms) => [...ms].sort((a, b) => (isUs(b.home) || isUs(b.away)) - (isUs(a.home) || isUs(a.away)));

    const isDone = (j) => j.date && j.date < today || j.matches.some(played);
    const upcoming = d.jornadas.filter((j) => !isDone(j));
    const done = d.jornadas.filter(isDone).reverse();

    const render = (list, max) => {
      const html = list.slice(0, max).map((j) => {
        const ms = sortMatches(pick(j));
        return ms.length ? jornadaHTML(j, ms) : "";
      }).join("");
      return html || `<p class="empty">No hay partidos.</p>`;
    };
    const max = showAllUpcoming ? 99 : 3;
    $("#upcoming").innerHTML = render(upcoming, max) + (upcoming.length > 3
      ? `<button class="btn btn--ghost" id="toggle-upcoming" type="button">${showAllUpcoming ? "Ver menos" : `Ver calendario completo (${upcoming.length} jornadas)`}</button>` : "");
    $("#toggle-upcoming")?.addEventListener("click", () => { showAllUpcoming = !showAllUpcoming; renderMatches(d); });
    $("#results").innerHTML = render(done, 99);
  }

  function renderStandings(d) {
    const rows = d.standings.map((s) => `
      <tr class="${isUs(s.team) ? "is-us" : ""}${s.retired ? " is-retired" : ""}">
        <td class="num">${s.retired ? "–" : s.position}</td>
        <td class="team-col">${crestHTML(s.team)}<span>${esc(s.team)}${s.retired ? ' <span class="retired">Retirado</span>' : ""}</span></td>
        <td class="num pts">${s.points}</td>
        <td class="num">${s.played}</td>
        <td class="num hide-xs">${s.won}</td>
        <td class="num hide-xs">${s.drawn}</td>
        <td class="num hide-xs">${s.lost}</td>
        <td class="num">${s.gd > 0 ? "+" : ""}${s.gd}</td>
      </tr>`).join("");
    $("#standings-body").innerHTML = rows;

    const notes = [];
    if (d.standings_source === "calculada") notes.push("La federación no publica la tabla de clasificación en esta categoría: se calcula con los resultados oficiales (3 pts victoria, 1 empate).");
    if (d.standings_incomplete_jornadas?.length) notes.push(`Faltan por descargar resultados de las jornadas ${d.standings_incomplete_jornadas.join(", ")}; se completarán en próximas actualizaciones.`);
    $("#standings-note").textContent = notes.join(" ");
  }

  function renderFooter(d, meta) {
    $("#updated-at").textContent = d.updated_at
      ? new Date(d.updated_at).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })
      : "—";
    if (d.source_url) $("#source-link").href = d.source_url;

    const msgs = [];
    if (usingMock) msgs.push("Mostrando datos de ejemplo (no se ha podido conectar con el servidor). Arranca <code>python backend/server.py</code> para tener datos actualizados.");
    if (meta?.error && !meta?.refreshing) msgs.push("No se pudo actualizar desde la federación; se muestran los últimos datos guardados.");
    if (meta?.refreshing) msgs.push("Actualizando datos desde la federación…");
    const n = $("#notice");
    n.innerHTML = msgs.join("<br>");
    n.hidden = !msgs.length;

    const btn = $("#refresh-btn");
    btn.disabled = !!meta?.refreshing;
    btn.textContent = meta?.refreshing ? "Actualizando…" : "Actualizar datos";
    btn.hidden = usingMock || staticMode;
  }

  // ---- Estadísticas (en positivo, siempre con datos reales) -----------------
  const shortName = (n) => n.replace(/^(C\.D\.|U\.D\.|C\.F\.)\s*/i, "");

  function renderStats(d) {
    const ours = d.jornadas.flatMap((j) => j.matches
      .filter((m) => (isUs(m.home) || isUs(m.away)) && played(m))
      .map((m) => {
        const home = isUs(m.home);
        return { j: j.number, date: m.date, rival: home ? m.away : m.home, home,
                 gf: home ? m.home_goals : m.away_goals, ga: home ? m.away_goals : m.home_goals };
      }));
    const remaining = d.jornadas.flatMap((j) => j.matches)
      .filter((m) => (isUs(m.home) || isUs(m.away)) && !played(m) && !m.home_retired && !m.away_retired && (m.date || "9") >= today).length;

    if (!ours.length) {
      $("#cheer").innerHTML = `<strong>¡La temporada está a punto de empezar!</strong><span>Aquí verás los logros del equipo.</span>`;
      $("#kpis").innerHTML = ""; $("#goals-chart").innerHTML = "";
      return;
    }

    const sum = (a, k) => a.reduce((s, x) => s + x[k], 0);
    const goals = sum(ours, "gf");
    const scoredIn = ours.filter((m) => m.gf > 0).length;
    const wins = ours.filter((m) => m.gf > m.ga).length;
    const draws = ours.filter((m) => m.gf === m.ga).length;
    const best = ours.reduce((a, b) => (b.gf > a.gf ? b : a));
    const closest = ours.filter((m) => m.gf < m.ga).sort((a, b) => (a.ga - a.gf) - (b.ga - b.gf) || b.gf - a.gf)[0];
    const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;

    const kpis = [];
    if (wins) kpis.push({ value: wins, label: wins === 1 ? "Victoria" : "Victorias", note: "¡Así se juega, equipo!" });
    if (draws) kpis.push({ value: draws, label: draws === 1 ? "Empate" : "Empates", note: "Puntos que valen oro" });
    kpis.push({ value: goals, label: goals === 1 ? "Gol marcado" : "Goles marcados", note: goals ? "Cada gol, una fiesta" : "El primero está al caer" });
    kpis.push({ value: `${scoredIn}/${ours.length}`, label: "Partidos marcando", note: scoredIn ? `Hemos marcado en ${pl(scoredIn, "partido", "partidos")}` : "¡A por el primero!" });
    if (best.gf > 0) kpis.push({ value: best.gf, label: "Récord en un partido", note: `Goles ante ${shortName(best.rival)} (J${best.j})` });
    if (closest && closest.ga - closest.gf <= 3) {
      const sc = closest.home ? `${closest.gf}-${closest.ga}` : `${closest.ga}-${closest.gf}`;
      kpis.push({ value: sc, label: "Partido más igualado", note: `Ante ${shortName(closest.rival)}: ¡a ${pl(closest.ga - closest.gf, "gol", "goles")}!` });
    }
    if (ours.length >= 4) {
      const half = Math.floor(ours.length / 2);
      const early = sum(ours.slice(0, half), "ga") / half;
      const late = sum(ours.slice(-half), "ga") / half;
      const pct = Math.round((1 - late / early) * 100);
      if (pct >= 10) kpis.push({ value: `−${pct}%`, label: "Goles encajados", note: `Últimos ${half} partidos frente a los ${half} primeros` });
    }
    kpis.push({ value: remaining, label: "Partidos por jugar", note: "Oportunidades para seguir creciendo" });

    $("#kpis").innerHTML = kpis.map((k) => `
      <div class="kpi"><span class="kpi__value">${esc(k.value)}</span><span class="kpi__label">${esc(k.label)}</span><span class="kpi__note">${esc(k.note)}</span></div>`).join("");

    const cheers = wins
      ? ["¡Ya sabemos lo que es ganar!", `${pl(wins, "victoria", "victorias")} y ${pl(goals, "gol", "goles")} esta temporada. ¡A por más!`]
      : goals
        ? ["¡Seguimos creciendo!", `Llevamos ${pl(goals, "gol", "goles")} y cada partido aprendemos algo nuevo. ¡Vamos, Kukuli!`]
        : ["¡El primer gol está muy cerca!", "Cada partido sumamos experiencia. ¡Vamos, Kukuli!"];
    $("#cheer").innerHTML = `<strong>${cheers[0]}</strong><span>${esc(cheers[1])}</span>`;

    // Gráfico de barras: una serie (nuestros goles), etiqueta solo en el máximo
    const max = Math.max(1, ...ours.map((m) => m.gf));
    $("#goals-chart").innerHTML = `
      <div class="bars" role="img" aria-label="Goles marcados por jornada: ${ours.map((m) => `jornada ${m.j}, ${m.gf}`).join("; ")}">
        ${ours.map((m) => {
          const score = m.home ? `${m.gf}-${m.ga}` : `${m.ga}-${m.gf}`;
          const tip = `J${m.j} · ${m.home ? "vs" : "en"} ${shortName(m.rival)} · ${score}`;
          return `<div class="bar" tabindex="0" data-tip="${esc(tip)}">
            <span class="bar__value${m.gf === best.gf && m.gf > 0 ? "" : " is-quiet"}">${m.gf}</span>
            <span class="bar__fill${m.gf ? "" : " is-zero"}" style="height:${(m.gf / max) * 100}%"></span>
            <span class="bar__label">J${m.j}</span>
          </div>`;
        }).join("")}
      </div>
      <div class="chart-tip" id="chart-tip" hidden></div>`;
    const tipEl = $("#chart-tip");
    document.querySelectorAll("#goals-chart .bar").forEach((b) => {
      const show = () => { tipEl.textContent = b.dataset.tip; tipEl.hidden = false;
        const r = b.getBoundingClientRect(), p = b.parentElement.getBoundingClientRect();
        tipEl.style.left = Math.min(Math.max(r.left - p.left + r.width / 2, 70), p.width - 70) + "px"; };
      b.addEventListener("mouseenter", show); b.addEventListener("focus", show);
      b.addEventListener("mouseleave", () => (tipEl.hidden = true)); b.addEventListener("blur", () => (tipEl.hidden = true));
    });
  }

  // ---- Noticias ------------------------------------------------------------
  function newsCard({ kicker, date, title, body, source, url, star }) {
    const head = url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(title)}</a>` : esc(title);
    return `<article class="news-card${star ? " news-card--star" : ""}">
      <p class="news-card__kicker"><span class="news-tag">${esc(kicker)}</span>${date ? `<time datetime="${esc(date)}">${esc(fmtDate(date, { day: "numeric", month: "long", year: "numeric" }))}</time>` : ""}</p>
      <h3 class="news-card__title">${head}</h3>
      <p class="news-card__body">${esc(body)}</p>
      <p class="news-card__source">Fuente: ${esc(source)}</p>
    </article>`;
  }

  function chronicle(m, j) {
    const home = isUs(m.home);
    const rival = shortName(home ? m.away : m.home);
    const gf = home ? m.home_goals : m.away_goals, ga = home ? m.away_goals : m.home_goals;
    const score = `${m.home_goals}-${m.away_goals}`;
    const where = home ? "en casa" : "a domicilio";
    const g = (n) => `${n} ${n === 1 ? "gol" : "goles"}`;
    if (gf > ga) return { title: `¡Victoria del Kukuli ante ${rival}!`, body: `Triunfo ${where} por ${score}. ${g(gf)} para celebrar y un partido para recordar. ¡Enhorabuena, campeones!` };
    if (gf === ga) return { title: `Empate ante ${rival}`, body: `Reparto de puntos ${where} (${score}). El equipo plantó cara hasta el final y suma su punto.` };
    if (ga - gf <= 2) return { title: `¡Qué cerca! ${score} ante ${rival}`, body: `El Kukuli se quedó a ${g(ga - gf)} de puntuar ${where}. Con ${g(gf)} a favor, el equipo demostró que puede competir con cualquiera.` };
    if (gf > 0) return { title: `${gf === 1 ? "Gol" : `${gf} goles`} del Kukuli ante ${rival}`, body: `Partido ${where} que terminó ${score}. Lo mejor: ${gf === 1 ? "el gol que celebramos todos" : `los ${gf} goles que celebramos todos`}. ¡Seguimos sumando!` };
    return { title: `Jornada de aprendizaje ante ${rival}`, body: `El partido ${where} terminó ${score} ante un rival exigente. Cada partido suma experiencia; ¡a por el siguiente con más ganas!` };
  }

  function renderNews(d) {
    const ours = d.jornadas.flatMap((j) => j.matches.filter((m) => isUs(m.home) || isUs(m.away)).map((m) => ({ m, j })));
    const cards = [];
    const next = ours.filter(({ m }) => !played(m) && m.date && m.date >= today && !m.home_retired && !m.away_retired)
      .sort((a, b) => a.m.date.localeCompare(b.m.date))[0];
    if (next) {
      const { m, j } = next, home = isUs(m.home), rival = shortName(home ? m.away : m.home);
      cards.push(newsCard({
        kicker: "Previa", date: m.date, title: `Próximo reto: ${home ? "recibimos a" : "visitamos al"} ${rival}`,
        body: `Jornada ${j.number}, ${fmtDate(m.date, { weekday: "long", day: "numeric", month: "long" })}${m.time ? ` a las ${m.time}` : ""}${m.venue ? ` en ${m.venue}` : ""}. ¡Os esperamos en la grada para animar!`,
        source: "calendario oficial RFCYLF",
      }));
    }
    ours.filter(({ m }) => played(m)).reverse().forEach(({ m, j }) => {
      const c = chronicle(m, j);
      cards.push(newsCard({ kicker: `Jornada ${j.number}`, date: m.date, title: c.title, body: c.body + (m.venue ? ` (${m.venue})` : ""), source: "resultados oficiales RFCYLF" }));
    });
    $("#news-auto").innerHTML = cards.join("") || `<p class="empty">Aún no hay crónicas.</p>`;

    const press = [...(window.NOTICIAS || [])].sort((a, b) => (b.destacada ? 1 : 0) - (a.destacada ? 1 : 0) || b.fecha.localeCompare(a.fecha));
    $("#news-press").innerHTML = press.map((n) => newsCard({ kicker: n.etiqueta || "Prensa", date: n.fecha, title: n.titulo, body: n.resumen, source: n.medio, url: n.url, star: n.destacada })).join("")
      || `<p class="empty">Aún no hay noticias de prensa.</p>`;
  }

  function renderPlayers() {
    const cfg = window.PLANTILLA || { jugadores: [] };
    const frases = window.FRASES || [];
    $("#players-notice").hidden = !cfg.ejemplo;
    const list = [...cfg.jugadores].sort((a, b) => (a.dorsal ?? 999) - (b.dorsal ?? 999));
    $("#players").innerHTML = list.length ? list.map((p, i) => `
      <li class="player">
        <span class="player__num" aria-label="Dorsal">${p.dorsal ?? "–"}</span>
        <div class="player__text">
          <strong class="player__name">${esc(p.nombre)}</strong>
          <span class="player__quote">“${esc(p.frase || frases[i % frases.length] || "")}”</span>
        </div>
      </li>`).join("") : `<li class="empty">Aún no hay jugadores.</li>`;
  }

  function renderAll(meta) {
    if (!DATA) return;
    buildCrests(DATA);
    buildHomeVenues(DATA);
    renderHeader(DATA);
    renderMatches(DATA);
    renderStandings(DATA);
    renderPlayers();
    renderStats(DATA);
    renderNews(DATA);
    renderFooter(DATA, meta);
  }

  // ---- Carga de datos -------------------------------------------------------
  let pollTimer = null;
  async function load() {
    try {
      const res = await fetch(CONFIG.api, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      const { data, meta } = await res.json();
      if (!data) throw new Error("sin datos");
      DATA = data; usingMock = false;
      renderAll(meta);
      clearTimeout(pollTimer);
      if (meta.refreshing) pollTimer = setTimeout(load, 4000);
    } catch (e) {
      // Sin servidor (GitHub Pages): leer el archivo de datos estático
      try {
        const res = await fetch(CONFIG.staticData, { cache: "no-cache" });
        if (!res.ok) throw new Error(res.status);
        DATA = await res.json(); usingMock = false; staticMode = true;
        renderAll(null);
      } catch {
        if (!DATA && window.MOCK_DATA) { DATA = window.MOCK_DATA; usingMock = true; renderAll(null); }
      }
    }
  }

  async function refresh() {
    const btn = $("#refresh-btn");
    btn.disabled = true; btn.textContent = "Actualizando…";
    try {
      const res = await fetch(CONFIG.refreshApi, { method: "POST" });
      const { meta } = await res.json();
      if (meta.refresh?.startsWith("espera")) {
        const min = meta.refresh.split("_")[1];
        btn.textContent = `Datos recientes (reintenta en ${min} min)`;
        setTimeout(() => { btn.disabled = false; btn.textContent = "Actualizar datos"; }, 4000);
        return;
      }
    } catch { /* ignorado */ }
    load();
  }

  // ---- Eventos --------------------------------------------------------------
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => { const on = x === t; x.classList.toggle("is-active", on); x.setAttribute("aria-selected", on); });
    document.querySelectorAll(".panel").forEach((p) => { p.hidden = p.id !== "panel-" + t.dataset.tab; });
    writePref("tab", t.dataset.tab);
    t.scrollIntoView({ block: "nearest", inline: "center" });
  }));
  document.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => {
    filter = c.dataset.filter; writePref("filter", filter);
    if (DATA) renderMatches(DATA);
  }));
  $("#refresh-btn").addEventListener("click", refresh);

  const savedTab = readPref("tab", "partidos");
  document.querySelector(`.tab[data-tab="${savedTab}"]`)?.click();

  // Pinta al instante los datos de ejemplo y luego intenta los reales
  if (window.MOCK_DATA && location.protocol === "file:") { DATA = window.MOCK_DATA; usingMock = true; renderAll(null); }
  else load();
})();
