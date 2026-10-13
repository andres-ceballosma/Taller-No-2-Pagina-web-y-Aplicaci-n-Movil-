'use strict';

/* ===== Configuración ===== */
const API = 'https://api.jolpi.ca/ergast/f1';
const TRAZADOS = 'https://raw.githubusercontent.com/bacinger/f1-circuits/master/circuits/';
const TZ_LOCAL = Intl.DateTimeFormat().resolvedOptions().timeZone;
const TZ_CO = 'America/Bogota';
const CACHE_MIN = 5;
const RACE_DURATION_H = 3;
const SVG_NS = 'http://www.w3.org/2000/svg';
const SECTOR_COLORS = ['#ff4a3d', '#3fa7ff', '#ffd23f'];

// circuitId de Jolpica -> archivo de trazado (bacinger/f1-circuits)
const CIRCUITOS = {
  albert_park: 'au-1953', shanghai: 'cn-2004', suzuka: 'jp-1962', bahrain: 'bh-2002',
  jeddah: 'sa-2021', miami: 'us-2022', imola: 'it-1953', monaco: 'mc-1929',
  villeneuve: 'ca-1978', catalunya: 'es-1991', red_bull_ring: 'at-1969', silverstone: 'gb-1948',
  spa: 'be-1925', hungaroring: 'hu-1986', zandvoort: 'nl-1948', monza: 'it-1922',
  baku: 'az-2016', marina_bay: 'sg-2008', americas: 'us-2012', rodriguez: 'mx-1962',
  interlagos: 'br-1940', vegas: 'us-2023', losail: 'qa-2004', yas_marina: 'ae-2009',
  madring: 'es-2026', madrid: 'es-2026', sepang: 'my-1999', sochi: 'ru-2014', istanbul: 'tr-2005',
};

const $ = (s) => document.querySelector(s);
const pad = (n) => String(n).padStart(2, '0');

/* ===== Utilidades ===== */
function toDate(date, time) { return new Date(`${date}T${time || '00:00:00Z'}`); }
function fmt(d, tz, opts) { return new Intl.DateTimeFormat('es-CO', { timeZone: tz, ...opts }).format(d); }
const FECHA_HORA = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };

function el(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  Object.assign(n, props);
  children.forEach((c) => n.append(c));
  return n;
}
function svg(tag, attrs = {}) {
  const n = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
  return n;
}

// fetch con tiempo límite para que "Cargando…" no se quede colgado si la red no responde
async function pedir(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(t); }
}

async function api(path) {
  const key = 'f1:' + path;
  try {
    const c = JSON.parse(sessionStorage.getItem(key));
    if (c && Date.now() - c.t < CACHE_MIN * 60000) return c.d;
  } catch (e) { /* sin caché */ }
  const data = (await pedir(`${API}/${path}.json`)).MRData;
  try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data })); } catch (e) { /* ignorar */ }
  return data;
}

function showError(container, retry, text) {
  container.replaceChildren(
    el('p', { className: 'msg' }, text || 'No se pudieron cargar los datos. Revisa tu conexión o inténtalo de nuevo.',
      el('button', { type: 'button', textContent: 'Reintentar', onclick: retry }))
  );
}

/* ===== Luces de salida ===== */
function encenderLuces() {
  document.querySelectorAll('.lights i').forEach((l, i) => setTimeout(() => l.classList.add('on'), 250 * (i + 1)));
}

/* ===== Temporizador ===== */
let timerId = null;
let reiniciarId = null;
let races = [];
let nextRound = null;

const SESIONES = [
  ['FirstPractice', 'Práctica libre 1'],
  ['SecondPractice', 'Práctica libre 2'],
  ['ThirdPractice', 'Práctica libre 3'],
  ['SprintQualifying', 'Clasificación sprint'],
  ['SprintShootout', 'Clasificación sprint'],
  ['Sprint', 'Sprint'],
  ['Qualifying', 'Clasificación'],
];

function renderSessions(race) {
  const items = SESIONES
    .filter(([k]) => race[k])
    .map(([k, name]) => ({ name, d: toDate(race[k].date, race[k].time), race: false }));
  items.push({ name: 'Carrera', d: toDate(race.date, race.time), race: true });
  items.sort((a, b) => a.d - b.d);

  const mismaZona = TZ_LOCAL === TZ_CO;
  $('#tz-note').textContent = mismaZona
    ? `Horas en tu zona horaria (${TZ_LOCAL}, igual a la de Colombia).`
    : `Horas en tu zona (${TZ_LOCAL}) y en Colombia (UTC−5).`;

  $('#sessions').replaceChildren(...items.map((s) => {
    const li = el('li', { className: s.race ? 'race' : '' },
      el('span', { className: 's-name', textContent: s.name }),
      el('span', { textContent: fmt(s.d, TZ_LOCAL, FECHA_HORA) }));
    if (!mismaZona) li.append(el('span', { className: 'co', textContent: 'Colombia: ' + fmt(s.d, TZ_CO, FECHA_HORA) }));
    return li;
  }));
}

function updateCountdown(target) {
  const diff = target - new Date();
  if (diff <= 0) {
    ['days', 'hours', 'mins', 'secs'].forEach((u) => ($('#cd-' + u).textContent = '00'));
    $('#race-status').textContent = 'La carrera ya comenzó. Revisa los resultados más abajo.';
    clearInterval(timerId);
    // Cuando termine la ventana de la carrera se busca la siguiente (un solo reinicio pendiente).
    const restante = target.getTime() + RACE_DURATION_H * 3600000 - Date.now();
    clearTimeout(reiniciarId);
    reiniciarId = setTimeout(setupNextRaceTimer, Math.max(restante, 60000));
    return;
  }
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  $('#cd-days').textContent = pad(days);
  $('#cd-hours').textContent = pad(hours);
  $('#cd-mins').textContent = pad(mins);
  $('#cd-secs').textContent = pad(secs);
  document.title = `${pad(days)}d ${pad(hours)}h ${pad(mins)}m | ${$('#race-name').textContent}`;
}

async function setupNextRaceTimer() {
  clearInterval(timerId);
  clearTimeout(reiniciarId);
  $('#race-status').textContent = '';
  try {
    const data = await api('current');
    races = data.RaceTable.Races;
    $('#season-label').textContent = data.RaceTable.season || '';

    const now = new Date();
    const next = races.find((r) => toDate(r.date, r.time).getTime() + RACE_DURATION_H * 3600000 > now);
    nextRound = next ? next.round : null;
    renderCalendar();
    if (sel.round === null) {
      // Por defecto se muestra la última carrera disputada (o la primera si aún no hay ninguna).
      const pasadas = races.filter((r) => toDate(r.date, r.time).getTime() + RACE_DURATION_H * 3600000 < now);
      selectRace((pasadas.length ? pasadas[pasadas.length - 1] : races[0]).round, false);
    }

    if (!next) {
      $('#race-name').textContent = 'Temporada finalizada';
      $('#race-place').textContent = 'El calendario se actualizará cuando se publique la próxima temporada.';
      return;
    }
    const target = toDate(next.date, next.time);
    $('#race-name').textContent = next.raceName;
    $('#race-place').textContent =
      `${next.Circuit.circuitName} · ${next.Circuit.Location.locality}, ${next.Circuit.Location.country} · Ronda ${next.round}`;
    renderSessions(next);
    updateCountdown(target);
    if (target > new Date()) timerId = setInterval(() => updateCountdown(target), 1000);
  } catch (err) {
    console.error('Error conectando con la API de F1:', err);
    $('#race-name').textContent = 'No se pudo cargar';
    $('#race-status').textContent = 'No hay conexión con la API de F1. Recarga la página en unos segundos.';
  }
}

/* ===== Calendario interactivo ===== */
const sel = { round: null, tab: 'results' };

function renderCalendar() {
  if (!races.length) return;
  const now = new Date();
  $('#calendar').replaceChildren(...races.map((r) => {
    const d = toDate(r.date, r.time);
    const cls = ['gp', r.round === nextRound ? 'next' : (d < now ? 'done' : ''), r.round === sel.round ? 'sel' : ''].join(' ');
    const b = el('button', { type: 'button', className: cls, onclick: () => selectRace(r.round, true) },
      el('span', { className: 'r' }, `Ronda ${r.round}`, ...(r.round === nextRound ? [el('b', { className: 'badge', textContent: 'Próxima' })] : [])),
      el('h3', { textContent: r.raceName.replace('Grand Prix', 'GP') }),
      el('p', { textContent: `${r.Circuit.Location.locality}, ${r.Circuit.Location.country}` }),
      el('p', { textContent: fmt(d, TZ_LOCAL, { day: 'numeric', month: 'long' }) }));
    b.dataset.round = r.round;
    b.setAttribute('aria-pressed', String(r.round === sel.round));
    return b;
  }));
}

function marcarSeleccion() {
  document.querySelectorAll('#calendar .gp').forEach((b) => {
    const on = b.dataset.round === sel.round;
    b.classList.toggle('sel', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

function selectedRace() { return races.find((r) => r.round === sel.round); }

function selectRace(round, scroll) {
  sel.round = round;
  marcarSeleccion();
  const r = selectedRace();
  const d = toDate(r.date, r.time);
  $('#last-race-label').textContent =
    `Ronda ${r.round} · ${r.raceName} · ${fmt(d, TZ_LOCAL, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  loadTab(sel.tab);
  loadStats();
  loadCircuit(r);
  if (scroll) $('#datos').scrollIntoView({ behavior: 'smooth' });
}

/* ===== Resultados, clasificación y campeonatos (por ronda) ===== */
function table(headers, rows) {
  const t = el('table');
  t.append(
    el('thead', {}, el('tr', {}, ...headers.map(([h, num]) => el('th', { scope: 'col', className: num ? 'num' : '', textContent: h })))),
    el('tbody', {}, ...rows.map((row) => el('tr', {}, ...row.map((c, i) => el('td', { className: headers[i][1] ? 'num' : '', textContent: c ?? '–' })))))
  );
  return el('div', { className: 'tabla' },
    el('p', { className: 'hint', textContent: 'Desliza hacia los lados para ver todas las columnas.' }),
    el('div', { className: 'table-scroll', tabIndex: 0 }, t));
}
const nombre = (d) => `${d.givenName} ${d.familyName}`;

function emptyMsg() {
  const r = selectedRace();
  const futura = r && toDate(r.date, r.time) > new Date();
  return el('p', {
    className: 'msg',
    textContent: futura
      ? 'Esta carrera todavía no se disputa. Los datos aparecerán cuando termine cada sesión.'
      : 'La API aún no tiene datos para esta carrera.',
  });
}

const VISTAS = {
  async results(s, r) {
    const d = await api(`${s}/${r}/results`);
    const race = d.RaceTable.Races[0];
    if (!race) return emptyMsg();
    return table(
      [['Pos', true], ['Piloto'], ['Equipo'], ['Parrilla', true], ['Vueltas', true], ['Tiempo / estado'], ['Puntos', true]],
      race.Results.map((x) => [x.position, nombre(x.Driver), x.Constructor.name, x.grid, x.laps, x.Time ? x.Time.time : x.status, x.points])
    );
  },
  async qualy(s, r) {
    const d = await api(`${s}/${r}/qualifying`);
    const race = d.RaceTable.Races[0];
    if (!race) return emptyMsg();
    return table(
      [['Pos', true], ['Piloto'], ['Equipo'], ['Q1'], ['Q2'], ['Q3']],
      race.QualifyingResults.map((x) => [x.position, nombre(x.Driver), x.Constructor.name, x.Q1, x.Q2, x.Q3])
    );
  },
  async drivers(s, r) {
    const l = (await api(`${s}/${r}/driverStandings`)).StandingsTable.StandingsLists[0];
    if (!l) return emptyMsg();
    return table(
      [['Pos', true], ['Piloto'], ['Equipo'], ['Victorias', true], ['Puntos', true]],
      l.DriverStandings.map((x) => [x.position, nombre(x.Driver), x.Constructors.map((c) => c.name).join(' / '), x.wins, x.points])
    );
  },
  async teams(s, r) {
    const l = (await api(`${s}/${r}/constructorStandings`)).StandingsTable.StandingsLists[0];
    if (!l) return emptyMsg();
    return table(
      [['Pos', true], ['Equipo'], ['Nacionalidad'], ['Victorias', true], ['Puntos', true]],
      l.ConstructorStandings.map((x) => [x.position, x.Constructor.name, x.Constructor.nationality, x.wins, x.points])
    );
  },
};

let tabToken = 0;
async function loadTab(tab) {
  sel.tab = tab;
  const r = selectedRace();
  if (!r) return;
  const token = ++tabToken;
  const panel = $('#panel');
  panel.replaceChildren(el('p', { className: 'msg', textContent: 'Cargando datos…' }));
  try {
    const content = await VISTAS[tab](r.season, r.round);
    if (token === tabToken) panel.replaceChildren(content);
  } catch (err) {
    console.error(err);
    if (token === tabToken) showError(panel, () => loadTab(tab));
  }
}

function initTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const activar = (b, enfocar) => {
    tabs.forEach((x) => {
      x.setAttribute('aria-selected', String(x === b));
      x.tabIndex = x === b ? 0 : -1;
    });
    $('#panel').setAttribute('aria-labelledby', b.id);
    if (enfocar) b.focus();
    loadTab(b.dataset.tab);
  };
  tabs.forEach((b, i) => {
    b.tabIndex = b.getAttribute('aria-selected') === 'true' ? 0 : -1;
    b.addEventListener('click', () => activar(b, false));
    b.addEventListener('keydown', (e) => {
      const salto = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      let destino = null;
      if (salto) destino = tabs[(i + salto + tabs.length) % tabs.length];
      else if (e.key === 'Home') destino = tabs[0];
      else if (e.key === 'End') destino = tabs[tabs.length - 1];
      if (destino) { e.preventDefault(); activar(destino, true); }
    });
  });
}

/* ===== Estadísticas: probabilidad de título, puntos y carreras ganadas/perdidas ===== */
const PUNTOS_F1 = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const SIMULACIONES = 3000;
const PROB_ABANDONO = 0.08;
const COLORES = {
  red_bull: '#3671c6', ferrari: '#e8002d', mercedes: '#27f4d2', mclaren: '#ff8000', aston_martin: '#229971',
  alpine: '#ff87bc', williams: '#64c4ff', rb: '#6692ff', haas: '#b6babd', sauber: '#52e252', audi: '#52e252', cadillac: '#d9b44a',
};
const PALETA = ['#e8c547', '#9b8cff', '#4ecdc4', '#ff6b6b', '#8ac926', '#ff9f1c'];

function colorEquipo(id) {
  if (COLORES[id]) return COLORES[id];
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}
const num = (n) => Number(n) || 0;
const pct = (p) => (p >= 0.1 ? `${p.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %` : p > 0 ? '<0,1 %' : '0 %');
const corto = (d) => `${(d.givenName || '?')[0]}. ${d.familyName}`;

// Simula las carreras que faltan. Cada piloto tiene una "fuerza" según sus puntos promedio por carrera
// (modelo Plackett-Luce con ruido Gumbel), un 8 % de abandono por carrera y reparto de puntos de carrera.
function simularTitulo(pilotos, equipos, restantes) {
  const gP = new Array(pilotos.length).fill(0);
  const gE = new Array(equipos.length).fill(0);
  const idxEq = new Map(equipos.map((e, i) => [e.id, i]));
  const fuerza = pilotos.map((p) => p.ppr / 5);
  const mejor = (arr) => arr.reduce((m, v, i) => (v > arr[m] ? i : m), 0);
  for (let n = 0; n < SIMULACIONES; n++) {
    const extra = new Array(pilotos.length).fill(0);
    for (let r = 0; r < restantes; r++) {
      const orden = pilotos
        .map((_, i) => ({ i, v: fuerza[i] - Math.log(-Math.log(Math.random() || 1e-12)) - (Math.random() < PROB_ABANDONO ? 100 : 0) }))
        .sort((a, b) => b.v - a.v);
      for (let k = 0; k < PUNTOS_F1.length; k++) if (orden[k].v > -50) extra[orden[k].i] += PUNTOS_F1[k];
    }
    gP[mejor(pilotos.map((p, i) => p.pts + extra[i]))]++;
    const tot = equipos.map((e) => e.pts);
    pilotos.forEach((p, i) => { const j = idxEq.get(p.equipo); if (j !== undefined) tot[j] += extra[i]; });
    gE[mejor(tot)]++;
  }
  return { pilotos: gP.map((x) => (x * 100) / SIMULACIONES), equipos: gE.map((x) => (x * 100) / SIMULACIONES) };
}

function tarjeta(titulo, sub, ancho, ...contenido) {
  return el('article', { className: 'stat' + (ancho ? ' ancho' : '') },
    el('h4', { textContent: titulo }),
    el('p', { className: 'note', textContent: sub }),
    ...contenido);
}

function barras(items, max) {
  return el('ul', { className: 'bars' }, ...items.map((it) => {
    const fill = el('span', { className: 'fill' });
    fill.style.width = (it.valor > 0 ? Math.max((it.valor / max) * 100, 1.5) : 0) + '%';
    fill.style.background = it.color;
    return el('li', {}, el('span', { className: 'b-lab', textContent: it.label, title: it.label }),
      el('span', { className: 'track' }, fill), el('span', { className: 'b-val', textContent: it.texto }));
  }));
}

function dona(items) {
  const R = 70, C = 2 * Math.PI * R;
  const s = svg('svg', { viewBox: '0 0 200 200', role: 'img', 'aria-label': 'Probabilidad de ganar el título por escudería' });
  s.append(svg('circle', { cx: 100, cy: 100, r: R, fill: 'none', stroke: 'var(--linea)', 'stroke-width': 28 }));
  let off = 0;
  items.filter((i) => i.valor > 0).forEach((i) => {
    const len = (C * i.valor) / 100;
    s.append(svg('circle', { cx: 100, cy: 100, r: R, fill: 'none', stroke: i.color, 'stroke-width': 28,
      'stroke-dasharray': `${len} ${C - len}`, 'stroke-dashoffset': -off, transform: 'rotate(-90 100 100)' }));
    off += len;
  });
  const top = items[0];
  const t1 = svg('text', { x: 100, y: 104, class: 'dona-num' }); t1.textContent = top ? pct(top.valor) : '';
  const t2 = svg('text', { x: 100, y: 124, class: 'dona-txt' }); t2.textContent = top ? top.label : '';
  s.append(t1, t2);
  const leyenda = el('ul', { className: 'leyenda' }, ...items.map((i) => {
    const dot = el('i'); dot.style.background = i.color;
    return el('li', {}, dot, el('span', { textContent: i.label }), el('b', { textContent: pct(i.valor) }));
  }));
  return el('div', { className: 'dona' }, s, leyenda);
}

function ganadasPerdidas(equipos, disputadas) {
  return el('ul', { className: 'wl' }, ...equipos.map((e) => {
    const perdidas = Math.max(disputadas - e.wins, 0);
    const win = el('span', { className: 'win' }); win.style.width = (disputadas ? (e.wins / disputadas) * 100 : 0) + '%'; win.style.background = e.color;
    const lost = el('span', { className: 'lost' }); lost.style.width = (disputadas ? (perdidas / disputadas) * 100 : 0) + '%';
    return el('li', {},
      el('div', { className: 'wl-top' }, el('span', { textContent: e.nombre }),
        el('small', { textContent: `${e.wins} ganadas · ${perdidas} sin ganar` })),
      el('span', { className: 'track', title: `${e.nombre}: ${e.wins} de ${disputadas} carreras ganadas` }, win, lost));
  }));
}

function columnas(items, max) {
  return el('div', { className: 'cols-wrap' }, el('div', { className: 'cols' }, ...items.map((it) => {
    const bar = el('span', { className: 'c-bar' });
    bar.style.height = (max ? (it.valor / max) * 100 : 0) + '%';
    bar.style.background = it.color;
    return el('div', { className: 'col', title: `${it.nombre}: ${it.valor} puntos` },
      el('span', { className: 'c-val', textContent: it.valor }),
      el('span', { className: 'c-plot' }, bar),
      el('span', { className: 'c-lab', textContent: it.cod }));
  })));
}

function construirStats(dr, cs, ronda, restantes) {
  const equipos = cs.map((x) => ({
    id: x.Constructor.constructorId, nombre: x.Constructor.name, pts: num(x.points), wins: num(x.wins),
    color: colorEquipo(x.Constructor.constructorId),
  }));
  const pilotos = dr.map((x) => {
    const t = x.Constructors[x.Constructors.length - 1];
    return {
      nombre: corto(x.Driver), cod: x.Driver.code || x.Driver.familyName.slice(0, 3).toUpperCase(),
      pts: num(x.points), ppr: num(x.points) / Math.max(ronda, 1), equipo: t.constructorId, color: colorEquipo(t.constructorId),
    };
  });
  const prob = simularTitulo(pilotos, equipos, restantes);
  pilotos.forEach((p, i) => { p.prob = prob.pilotos[i]; });
  equipos.forEach((e, i) => { e.prob = prob.equipos[i]; });
  const porProb = (a, b) => b.prob - a.prob || b.pts - a.pts;

  const pp = [...pilotos].sort(porProb);
  const top = pp.filter((p) => p.prob >= 0.1).slice(0, 10);
  const resto = pp.filter((p) => !top.includes(p)).reduce((s, p) => s + p.prob, 0);
  const itemsP = top.map((p) => ({ label: p.nombre, valor: p.prob, texto: pct(p.prob), color: p.color }));
  if (resto > 0) itemsP.push({ label: 'Resto', valor: resto, texto: pct(resto), color: '#4a4d57' });

  const ee = [...equipos].sort(porProb);
  const porPuntosE = [...equipos].sort((a, b) => b.pts - a.pts);
  const porGanadas = [...equipos].sort((a, b) => b.wins - a.wins || b.pts - a.pts);
  const porPuntosP = [...pilotos].sort((a, b) => b.pts - a.pts);

  return [
    tarjeta('Probabilidad de título: pilotos', 'Barras sobre una escala de 0 a 100 %.', false, barras(itemsP, 100)),
    tarjeta('Probabilidad de título: escuderías', 'Reparto del 100 % entre las escuderías.', false,
      dona(ee.map((e) => ({ label: e.nombre, valor: e.prob, color: e.color })))),
    tarjeta('Carreras ganadas y sin ganar por equipo', `De ${ronda} carreras disputadas. Cada barra se divide entre victorias (color) y carreras sin ganar (gris).`, false,
      ganadasPerdidas(porGanadas, ronda)),
    tarjeta('Puntos por escudería', 'Puntos acumulados en el campeonato de constructores.', false,
      barras(porPuntosE.map((e) => ({ label: e.nombre, valor: e.pts, texto: String(e.pts), color: e.color })), porPuntosE[0].pts || 1)),
    tarjeta('Puntos por piloto', 'Puntos acumulados en el campeonato de pilotos.', true,
      el('p', { className: 'hint', textContent: 'Desliza hacia los lados para ver todos los pilotos.' }),
      columnas(porPuntosP.map((p) => ({ nombre: p.nombre, cod: p.cod, valor: p.pts, color: p.color })), porPuntosP[0].pts || 1)),
  ];
}

let statsToken = 0;
async function loadStats() {
  const r = selectedRace();
  if (!r) return;
  const token = ++statsToken;
  const box = $('#stats-body');
  const ronda = Number(r.round);
  const restantes = races.filter((x) => Number(x.round) > ronda).length;
  box.replaceChildren(el('p', { className: 'msg', textContent: 'Calculando estadísticas…' }));
  try {
    const [d, c] = await Promise.all([api(`${r.season}/${r.round}/driverStandings`), api(`${r.season}/${r.round}/constructorStandings`)]);
    if (token !== statsToken) return;
    const ld = d.StandingsTable.StandingsLists[0], lc = c.StandingsTable.StandingsLists[0];
    if (!ld || !lc) { box.replaceChildren(emptyMsg()); return; }
    box.replaceChildren(...construirStats(ld.DriverStandings, lc.ConstructorStandings, ronda, restantes));
  } catch (err) {
    console.error(err);
    if (token === statsToken) showError(box, loadStats);
  }
}

/* ===== Circuito con sectores ===== */
const cacheTrazados = new Map();

async function trazado(file) {
  if (!cacheTrazados.has(file)) {
    const j = await pedir(`${TRAZADOS}${file}.geojson`);
    const f = j.type === 'FeatureCollection' ? j.features[0] : j;
    cacheTrazados.set(file, f);
  }
  return cacheTrazados.get(file);
}

function haversine(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Extrae las coordenadas (acepta LineString, MultiLineString o Polygon) y cierra la vuelta si hace falta.
function extraerCoords(geom) {
  let pts = [];
  if (geom.type === 'LineString') pts = geom.coordinates;
  else if (geom.type === 'MultiLineString') pts = geom.coordinates.flat();
  else if (geom.type === 'Polygon') pts = geom.coordinates[0];
  pts = pts.map((p) => [p[0], p[1]]);
  if (pts.length > 2 && haversine(pts[0], pts[pts.length - 1]) > 5) pts.push(pts[0]);
  return pts;
}

// Divide el trazado en 3 sectores de igual longitud, con los cortes calculados de forma exacta
// (los límites oficiales de sector no vienen en los datos).
function dividirSectores(coords) {
  const acum = [0];
  for (let i = 1; i < coords.length; i++) acum.push(acum[i - 1] + haversine(coords[i - 1], coords[i]));
  const total = acum[acum.length - 1];
  const corte = (m) => {
    const i = Math.max(1, acum.findIndex((a) => a >= m));
    const t = (m - acum[i - 1]) / (acum[i] - acum[i - 1] || 1);
    const p = [coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t, coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t];
    return { i, p };
  };
  const c1 = corte(total / 3), c2 = corte((2 * total) / 3);
  const tramos = [
    [...coords.slice(0, c1.i), c1.p],
    [c1.p, ...coords.slice(c1.i, c2.i), c2.p],
    [c2.p, ...coords.slice(c2.i)],
  ];
  return { sectores: tramos.map((pts) => ({ pts, metros: total / 3 })), total };
}

function dibujarCircuito(coords, sectores) {
  const W = 640, H = 440, P = 36;
  const lat0 = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xy = (c) => [c[0] * k, -c[1]];
  const all = coords.map(xy);
  const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1])), maxY = Math.max(...all.map((p) => p[1]));
  const esc = Math.min((W - 2 * P) / (maxX - minX || 1), (H - 2 * P) / (maxY - minY || 1));
  const ox = (W - (maxX - minX) * esc) / 2, oy = (H - (maxY - minY) * esc) / 2;
  const pt = (c) => { const p = xy(c); return [ox + (p[0] - minX) * esc, oy + (p[1] - minY) * esc]; };
  const d = (pts) => 'M' + pts.map((c) => pt(c).map((n) => n.toFixed(1)).join(',')).join('L');

  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Trazado del circuito dividido en tres sectores' });
  s.append(svg('path', { d: d(coords), class: 'pista-base' }));
  sectores.forEach((sec, i) => s.append(svg('path', { d: d(sec.pts), class: 'sector', 'data-s': i, stroke: SECTOR_COLORS[i] })));
  [1, 2].forEach((i) => {
    const [x, y] = pt(sectores[i].pts[0]);
    s.append(svg('circle', { cx: x, cy: y, r: 5, class: 'corte' }));
  });
  const [mx, my] = pt(coords[0]);
  s.append(svg('circle', { cx: mx, cy: my, r: 7, class: 'meta' }));
  const izq = mx > W * 0.7;  // si la meta queda cerca del borde derecho, la etiqueta va a la izquierda
  const t = svg('text', { x: izq ? mx - 12 : mx + 12, y: my < P ? my + 22 : my - 10, class: 'meta-txt', 'text-anchor': izq ? 'end' : 'start' });
  t.textContent = 'Meta';
  s.append(t);
  return s;
}

function resaltar(i) {
  document.querySelectorAll('#circuit-map .sector').forEach((p) => p.classList.toggle('apagado', i !== null && +p.dataset.s !== i));
}

let fijado = null;
let circuitToken = 0;
async function loadCircuit(race) {
  const token = ++circuitToken;
  const c = race.Circuit;
  $('#circuit-name').textContent = c.circuitName;
  $('#circuit-place').textContent = `${c.Location.locality}, ${c.Location.country} · ${race.raceName}`;
  $('#circuit-sub').textContent = `Trazado de la ronda ${race.round}. Cambia de carrera desde el calendario.`;
  const map = $('#circuit-map'), legend = $('#sector-legend');
  const file = CIRCUITOS[c.circuitId];
  legend.replaceChildren();
  fijado = null;
  $('#circuit-note').textContent = '';
  if (!file) { map.replaceChildren(el('p', { className: 'msg', textContent: 'Todavía no hay un trazado disponible para este circuito.' })); return; }
  map.replaceChildren(el('p', { className: 'msg', textContent: 'Cargando trazado…' }));
  try {
    const f = await trazado(file);
    if (token !== circuitToken) return;
    const coords = extraerCoords(f.geometry);
    const { sectores, total } = dividirSectores(coords);
    const prop = f.properties ? Number(f.properties.length) : 0;
    // Se usa la longitud publicada solo si coincide (±30 %) con la calculada desde el trazado.
    const oficial = prop > 0 && prop / total > 0.7 && prop / total < 1.3 ? prop : null;
    const km = (m) => (m / 1000).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const escala = oficial ? oficial / total : 1;
    map.replaceChildren(dibujarCircuito(coords, sectores));
    legend.replaceChildren(...sectores.map((sec, i) => {
      const b = el('button', { type: 'button' },
        el('i', { style: `background:${SECTOR_COLORS[i]}` }),
        el('span', { textContent: `Sector ${i + 1}` }),
        el('small', { textContent: `${km(sec.metros * escala)} km` }));
      ['mouseenter', 'focus'].forEach((ev) => b.addEventListener(ev, () => resaltar(i)));
      ['mouseleave', 'blur'].forEach((ev) => b.addEventListener(ev, () => resaltar(fijado)));
      b.addEventListener('click', () => { fijado = fijado === i ? null : i; resaltar(fijado); });
      return el('li', {}, b);
    }), el('li', { className: 'total', textContent: `Longitud de vuelta: ${km(oficial || total)} km` }));
    $('#circuit-note').textContent =
      'Los sectores se calculan dividiendo la vuelta en tres tramos de igual longitud; los límites oficiales de F1 pueden variar.';
  } catch (err) {
    console.error(err);
    if (token === circuitToken) showError(map, () => loadCircuit(race), 'No se pudo cargar el trazado del circuito.');
  }
}

/* ===== Inicio ===== */
encenderLuces();
initTabs();
setupNextRaceTimer();