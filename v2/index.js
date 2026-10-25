'use strict';
// TikTok Live Adviser v2: avisa por webhook de Discord cuando un creador inicia LIVE.
// Novedades: panel web integrado, API de estado, revisiones aleatorias y espaciado adaptativo.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = '2.0.0';
const CONFIG_PATH = path.join(__dirname, 'config.json');
const STATE_PATH = path.join(__dirname, 'state.json');
const EDITOR_PATH = path.join(__dirname, 'public', 'index.html');
const OPTS = { processInitialData: false, fetchRoomInfoOnConnect: false, enableExtendedGiftInfo: false };

const log = (...a) => console.log(`[${new Date().toLocaleTimeString()}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const iso = (t) => (t ? new Date(t).toISOString() : null);
const keyOf = (c) => String(c.tiktokUsername || '').replace(/^@/, '').trim().toLowerCase();
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

// ---------- Configuración ----------
function normalize(raw) {
  const n = (v, d, min) => (v !== '' && v != null && Number.isFinite(+v) ? Math.max(min, +v) : d);
  return {
    ...raw,
    checkIntervalMinutes: n(raw.checkIntervalMinutes, 2, 0.5),
    delayBetweenChecksSeconds: n(raw.delayBetweenChecksSeconds, 2, 0),
    offlineThreshold: Math.round(n(raw.offlineThreshold, 2, 1)),
    jitterPercent: Math.min(90, n(raw.jitterPercent, 30, 0)),
    stableThreshold: Math.round(n(raw.stableThreshold, 3, 0)), // 0 = desactiva el espaciado
    backoffFactor: n(raw.backoffFactor, 2, 1),
    maxIntervalMinutes: n(raw.maxIntervalMinutes, 15, 0.5),
    defaults: raw.defaults || {},
    creators: Array.isArray(raw.creators) ? raw.creators : [],
  };
}

let cfg = null, cfgMtime = 0, cfgErr = '';
function loadConfig(force) {
  try {
    const m = fs.statSync(CONFIG_PATH).mtimeMs;
    if (!force && m === cfgMtime) return;
    cfgMtime = m;
    cfg = normalize(JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')));
    cfgErr = '';
    log(`Config cargada: ${cfg.creators.length} creador(es).`);
  } catch (e) {
    if (e.message !== cfgErr) log(`⚠️ config.json ilegible (${e.message}). Sigo con la última versión buena.`);
    cfgErr = e.message;
  }
}

function validate(j) {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return 'El JSON debe ser un objeto.';
  if (!Array.isArray(j.creators)) return '"creators" debe ser una lista.';
  for (const [i, c] of j.creators.entries()) {
    if (!c || typeof c.tiktokUsername !== 'string' || !c.tiktokUsername.trim()) return `Creador #${i + 1}: falta tiktokUsername.`;
    if (c.webhooks !== undefined && (!Array.isArray(c.webhooks) || c.webhooks.some((w) => typeof w !== 'string'))) return `Creador #${i + 1}: "webhooks" debe ser una lista de URLs.`;
  }
  return null;
}

// ---------- Estado y planificación ----------
const saved = readJson(STATE_PATH, {});
const rt = {};
const stats = { startedAt: Date.now(), checks: 0, errors: 0, alertsSent: 0 };
const R = (c) => (rt[keyOf(c)] ||= {
  isLive: !!saved[keyOf(c)]?.isLive, startedAt: saved[keyOf(c)]?.startedAt || null,
  misses: 0, stable: 0, errStreak: 0, checks: 0, errors: 0,
  lastCheckAt: null, nextCheckAt: 0, intervalMs: 0, lastError: null,
});
const saveState = () => {
  const out = {};
  for (const [k, r] of Object.entries(rt)) out[k] = { isLive: r.isLive, startedAt: r.startedAt };
  try { fs.writeFileSync(STATE_PATH, JSON.stringify(out, null, 2)); } catch {}
};

// Intervalo base; tras `stableThreshold` revisiones sin cambios se va espaciando (×factor) hasta el máximo.
// Tras errores seguidos también se espacia, para no insistir si TikTok bloquea la IP.
function nextInterval(c, r) {
  const base = c.checkIntervalMinutes * 60000;
  const cap = Math.max(base, c.maxIntervalMinutes * 60000);
  if (r.errStreak > 0) return Math.min(base * 2 ** Math.min(r.errStreak, 10), cap);
  if (c.stableThreshold > 0 && r.stable >= c.stableThreshold) {
    return Math.min(base * c.backoffFactor ** (r.stable - c.stableThreshold + 1), cap);
  }
  return base;
}
function schedule(r) {
  const j = cfg.jitterPercent / 100;
  r.intervalMs = nextInterval(cfg, r);
  r.nextCheckAt = Date.now() + r.intervalMs * (1 + rand(-j, j)); // tiempo aleatorio ± jitter
}

// ---------- Mensajes y Discord ----------
function render(v, vars) {
  if (typeof v === 'string') return v.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? '') : m));
  if (Array.isArray(v)) return v.map((x) => render(x, vars));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, render(x, vars)]));
  return v;
}
function prune(v) {
  if (Array.isArray(v)) return v.map(prune);
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) { if (x === '' && /url$/i.test(k)) continue; o[k] = prune(x); }
    for (const k of ['image', 'thumbnail', 'author', 'footer']) {
      if (o[k] && typeof o[k] === 'object' && !o[k].url && !o[k].text && !o[k].name) delete o[k];
    }
    return o;
  }
  return v;
}
function buildPayload(src, vars) {
  const mode = src.mode || 'message';
  const p = { username: render(src.botName || 'Alerta TikTok LIVE', vars) };
  if (src.botAvatar) p.avatar_url = render(src.botAvatar, vars);
  const parts = [];
  if (src.mention) parts.push(src.mention);
  if ((mode === 'message' || mode === 'both') && src.message) parts.push(render(src.message, vars));
  if (parts.length) p.content = parts.join('\n');
  if ((mode === 'embed' || mode === 'both') && src.embeds?.length) p.embeds = prune(render(src.embeds, vars)).slice(0, 10);
  p.allowed_mentions = { parse: ['everyone', 'roles', 'users'] };
  return p;
}
const urlsOf = (e) => (e.webhooks || []).filter((u) => typeof u === 'string' && u.startsWith('https://') && !u.includes('AQUÍ'));

async function sendWebhook(url, payload, tries = 3) {
  for (let i = 0; i <= tries; i++) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000) });
      if (res.ok) return true;
      if (res.status === 429) { const d = await res.json().catch(() => ({})); await sleep((d.retry_after ?? 1) * 1000 + 200); continue; }
      log(`❌ Webhook respondió ${res.status}: ${(await res.text()).slice(0, 150)}`);
      return false;
    } catch (err) { log(`❌ Error enviando webhook: ${err.message}`); return false; }
  }
  return false;
}
async function sendAll(hooks, payload) {
  const ok = (await Promise.all(hooks.map((u) => sendWebhook(u, payload)))).filter(Boolean).length;
  stats.alertsSent += ok;
  return ok;
}
const fmtDuration = (ms) => { const m = Math.floor(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
const liveVars = (u, info = {}) => ({
  username: u, url: `https://www.tiktok.com/@${u}/live`, title: info.title || 'Sin título', viewers: info.user_count ?? 'N/D',
  cover: info.cover?.url_list?.[0] || '', avatar: info.owner?.avatar_thumb?.url_list?.[0] || '',
  time: new Date().toLocaleTimeString(), iso: new Date().toISOString(),
});

// ---------- Revisión de un creador ----------
let Connection;
async function checkUser(c) {
  const username = String(c.tiktokUsername || '').replace(/^@/, '').trim();
  const e = { ...cfg.defaults, ...c };
  const r = R(c);
  const hooks = urlsOf(e);
  if (!username || !hooks.length) { r.lastError = 'Sin usuario o sin webhooks válidos'; r.nextCheckAt = Date.now() + 60000; return; }

  let live, conn;
  r.lastCheckAt = Date.now(); r.checks++; stats.checks++;
  try {
    conn = new Connection(username, OPTS);
    live = await conn.fetchIsLive();
  } catch (err) {
    const msg = err?.message || String(err);
    r.errors++; stats.errors++; r.errStreak++;
    if (msg !== r.lastError || r.errStreak % 10 === 0) log(`⚠️ ${username}: ${msg} (error seguido #${r.errStreak}; espacio los reintentos)`);
    r.lastError = msg;
    return schedule(r);
  }
  r.errStreak = 0; r.lastError = null;

  if (live === r.isLive) { // sin cambios: cuenta como revisión estable
    r.stable++; r.misses = 0;
    if (cfg.stableThreshold > 0 && r.stable === cfg.stableThreshold) log(`⏭️ ${username}: estado estable (${r.stable} revisiones), reduzco la frecuencia.`);
    return schedule(r);
  }

  r.stable = 0; // hubo cambio (o posible cambio): vuelve a la frecuencia normal
  if (live) {
    r.isLive = true; r.startedAt = Date.now(); r.misses = 0; saveState();
    log(`🔴 ${username} está en LIVE`);
    let info = {};
    try { info = (await conn.fetchRoomInfo?.()) || {}; } catch {}
    await sendAll(hooks, buildPayload(e, liveVars(username, info)));
    return schedule(r);
  }
  if (++r.misses < cfg.offlineThreshold) return schedule(r); // aún sin confirmar que terminó
  r.isLive = false; r.misses = 0; saveState();
  log(`⚫ El LIVE de ${username} terminó`);
  if (e.onEnd?.enabled) {
    const vars = { username, url: `https://www.tiktok.com/@${username}`, duration: fmtDuration(Date.now() - (r.startedAt || Date.now())) };
    await sendAll(hooks, buildPayload({ botName: e.botName, botAvatar: e.botAvatar, mode: 'message', ...e.onEnd }, vars));
  }
  schedule(r);
}

let stopping = false;
async function loop() {
  while (!stopping) {
    loadConfig(false);
    const due = cfg.creators.filter((c) => keyOf(c) && R(c).nextCheckAt <= Date.now());
    for (const c of due) {
      if (stopping) break;
      await checkUser(c).catch((err) => log(`Error inesperado: ${err.message}`));
      const d = cfg.delayBetweenChecksSeconds;
      await sleep(rand(d * 0.5, d * 1.5) * 1000); // pausa aleatoria entre creadores
    }
    if (due.length) saveState();
    await sleep(1000);
  }
}

// ---------- Servidor web y API ----------
function status() {
  return {
    service: 'tiktok-live-adviser', version: VERSION, ok: true, now: iso(Date.now()), startedAt: iso(stats.startedAt),
    uptimeSec: Math.round((Date.now() - stats.startedAt) / 1000), stats,
    settings: Object.fromEntries(['checkIntervalMinutes', 'jitterPercent', 'stableThreshold', 'backoffFactor', 'maxIntervalMinutes', 'offlineThreshold'].map((k) => [k, cfg[k]])),
    creators: cfg.creators.map((c) => {
      const r = R(c);
      return { username: keyOf(c), isLive: r.isLive, liveSince: r.isLive ? iso(r.startedAt) : null, lastCheckAt: iso(r.lastCheckAt), nextCheckAt: r.nextCheckAt ? iso(r.nextCheckAt) : null,
        intervalSec: Math.round(r.intervalMs / 1000), stableChecks: r.stable, errorStreak: r.errStreak, lastError: r.lastError, checks: r.checks, errors: r.errors, webhooks: urlsOf({ ...cfg.defaults, ...c }).length };
    }),
  };
}
const send = (res, code, obj, h = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...h }); res.end(JSON.stringify(obj)); };
const readBody = (req, max = 1e6) => new Promise((ok, no) => {
  let b = '';
  req.on('data', (d) => { b += d; if (b.length > max) { no(new Error('Cuerpo demasiado grande')); req.destroy(); } });
  req.on('end', () => ok(b)); req.on('error', no);
});

function startServer() {
  const sc = cfg.server || {};
  const host = process.env.HOST || sc.host || '127.0.0.1';
  const port = +(process.env.PORT || sc.port || 3000);
  const token = process.env.ADMIN_TOKEN || sc.token || '';
  const local = ['127.0.0.1', 'localhost', '::1'].includes(host);
  const authed = (req) => {
    if (!token) return local;
    const a = Buffer.from(req.headers.authorization || ''), b = Buffer.from('Bearer ' + token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  const srv = http.createServer(async (req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    try {
      if (req.method === 'GET' && (p === '/' || p === '/index.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(fs.readFileSync(EDITOR_PATH)); }
      if (req.method === 'GET' && p === '/api/status') return send(res, 200, status(), { 'Access-Control-Allow-Origin': '*' });
      if (!p.startsWith('/api/')) return send(res, 404, { error: 'No encontrado' });
      if (!authed(req)) return send(res, token ? 401 : 403, { error: token ? 'Token inválido' : 'Fuera de localhost define ADMIN_TOKEN para usar este endpoint' });

      if (req.method === 'GET' && p === '/api/config') return send(res, 200, readJson(CONFIG_PATH, {}));
      if (req.method === 'PUT' && p === '/api/config') {
        let j; try { j = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: 'JSON inválido' }); }
        const err = validate(j); if (err) return send(res, 400, { error: err });
        if (fs.existsSync(CONFIG_PATH)) fs.copyFileSync(CONFIG_PATH, CONFIG_PATH + '.bak');
        fs.writeFileSync(CONFIG_PATH + '.tmp', JSON.stringify(j, null, 2)); fs.renameSync(CONFIG_PATH + '.tmp', CONFIG_PATH);
        loadConfig(true);
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && p === '/api/test') {
        const { username } = JSON.parse((await readBody(req)) || '{}');
        const c = cfg.creators.find((x) => keyOf(x) === String(username || '').replace(/^@/, '').toLowerCase());
        if (!c) return send(res, 404, { error: 'Guarda primero la config: ese tiktoker no existe en el servidor.' });
        const e = { ...cfg.defaults, ...c }, hooks = urlsOf(e);
        if (!hooks.length) return send(res, 400, { error: 'Ese tiktoker no tiene webhooks válidos.' });
        const payload = buildPayload({ ...e, botName: (e.botName || 'Alerta TikTok LIVE') + ' (prueba)' }, liveVars(keyOf(c), { title: 'Mensaje de prueba', user_count: 0 }));
        return send(res, 200, { sent: await sendAll(hooks, payload) });
      }
      send(res, 404, { error: 'No encontrado' });
    } catch (err) { send(res, 500, { error: err.message }); }
  });
  srv.on('error', (e) => { log(`❌ No pude abrir el servidor web en ${host}:${port}: ${e.message}`); });
  srv.listen(port, host, () => log(`🌐 Panel en http://${host}:${port}  ·  API de estado: /api/status${token ? '  ·  token activo' : ''}`));
  return srv;
}

async function main() {
  loadConfig(true);
  if (!cfg) { console.error('No pude leer config.json'); process.exit(1); }
  const lib = await import('tiktok-live-connector');
  Connection = lib.TikTokLiveConnection || lib.default?.TikTokLiveConnection;
  if (!Connection) throw new Error('No encontré TikTokLiveConnection. Exports: ' + Object.keys(lib).join(', '));
  const srv = startServer();
  const stop = () => { stopping = true; saveState(); srv.close(); log('Detenido.'); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  log(`TikTok Live Adviser v${VERSION} iniciado`);
  loop();
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { nextInterval, normalize, validate };
