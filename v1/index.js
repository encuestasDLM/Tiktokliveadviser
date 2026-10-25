let Connection;
async function loadLib() {
  // La v2 es ESM: se carga con import() en lugar de require()
  const lib = await import('tiktok-live-connector');
  Connection = lib.TikTokLiveConnection || lib.default?.TikTokLiveConnection || lib.WebcastPushConnection;
  if (!Connection) throw new Error('No encontré la clase de conexión. Exports: ' + Object.keys(lib).join(', '));
}
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const STATE_PATH = path.join(__dirname, 'state.json');

const log = (...a) => console.log(`[${new Date().toLocaleTimeString()}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Utilidades ----------
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

let lastGoodConfig = null;
function loadConfig() {
  // Se relee en cada ciclo: puedes editar config.json sin reiniciar el bot
  try {
    lastGoodConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    log(`⚠️ config.json inválido, uso la última versión buena: ${e.message}`);
  }
  return lastGoodConfig;
}

const state = readJson(STATE_PATH, {});
const saveState = () => fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));

// Reemplaza {variables} en cualquier string, array u objeto (embeds completos)
function render(value, vars) {
  if (typeof value === 'string') {
    return value.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? '') : m));
  }
  if (Array.isArray(value)) return value.map((v) => render(v, vars));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, render(v, vars)]));
  }
  return value;
}

// Quita urls vacías (Discord rechaza imágenes con url "")
function prune(value) {
  if (Array.isArray(value)) return value.map(prune);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'string' && v === '' && /url$/i.test(k)) continue;
      out[k] = prune(v);
    }
    for (const k of ['image', 'thumbnail', 'author', 'footer']) {
      if (out[k] && typeof out[k] === 'object' && !out[k].url && !out[k].text && !out[k].name) delete out[k];
    }
    return out;
  }
  return value;
}

function buildPayload(src, vars) {
  const mode = src.mode || 'message';
  const payload = { username: render(src.botName || 'Alerta TikTok LIVE', vars) };
  if (src.botAvatar) payload.avatar_url = render(src.botAvatar, vars);

  const parts = [];
  if (src.mention) parts.push(src.mention);
  if ((mode === 'message' || mode === 'both') && src.message) parts.push(render(src.message, vars));
  if (parts.length) payload.content = parts.join('\n');

  if ((mode === 'embed' || mode === 'both') && src.embeds?.length) {
    payload.embeds = prune(render(src.embeds, vars)).slice(0, 10);
  }
  payload.allowed_mentions = { parse: ['everyone', 'roles', 'users'] };
  return payload;
}

async function sendWebhook(url, payload, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      await axios.post(url, payload, { timeout: 10000 });
      return true;
    } catch (e) {
      if (e.response?.status === 429) {
        const wait = (e.response.data?.retry_after ?? 1) * 1000 + 200;
        await sleep(wait);
        continue;
      }
      log(`❌ Error enviando webhook (${e.response?.status ?? e.code}): ${JSON.stringify(e.response?.data ?? e.message)}`);
      return false;
    }
  }
  return false;
}

const urlsOf = (c) => [...(c.webhooks || []), ...(c.discordWebhookUrl ? [c.discordWebhookUrl] : [])].filter(
  (u) => u && u.startsWith('https://') && !u.includes('AQUÍ')
);

function formatDuration(ms) {
  const m = Math.floor(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

// ---------- Lógica principal ----------
async function checkUser(creator, defaults) {
  const cfg = { ...defaults, ...creator };
  const username = creator.tiktokUsername.replace(/^@/, '').trim();
  const key = username.toLowerCase();
  const s = (state[key] ||= { isLive: false, misses: 0 });
  const webhooks = urlsOf(cfg);
  if (!webhooks.length) return log(`⚠️ ${username}: sin webhooks válidos, lo omito.`);

  let conn;
  let live;
  try {
    conn = new Connection(username, {
      processInitialData: false,
      fetchRoomInfoOnConnect: false,
      enableExtendedGiftInfo: false,
    });
    if (typeof conn.fetchIsLive === 'function') {
      live = await conn.fetchIsLive(); // v2: petición ligera, sin websocket
    } else {
      // v1: conectar y desconectar; si no hay sala activa, lanza error
      try {
        const st = await conn.connect();
        live = !!st?.roomId;
        conn.disconnect();
      } catch (e) {
        if (/offline|not live|isn't online|LIVE has ended/i.test(String(e?.message ?? e))) live = false;
        else throw e;
      }
    }
  } catch (e) {
    return log(`⚠️ ${username}: fallo de la librería/red. No cambio su estado.\n${e?.stack || e}`);
  }

  if (live) {
    s.misses = 0;
    if (s.isLive) return;

    s.isLive = true;
    s.startedAt = Date.now();
    saveState();
    log(`🔴 ${username} está en LIVE`);

    let info = {};
    try {
      info = (await (conn.fetchRoomInfo?.() ?? conn.getRoomInfo?.())) || {};
    } catch {}

    const now = new Date();
    const vars = {
      username,
      url: `https://www.tiktok.com/@${username}/live`,
      title: info.title || 'Sin título',
      viewers: info.user_count ?? 'N/D',
      cover: info.cover?.url_list?.[0] || '',
      avatar: info.owner?.avatar_thumb?.url_list?.[0] || '',
      time: now.toLocaleTimeString(),
      iso: now.toISOString(),
    };
    const payload = buildPayload(cfg, vars);
    await Promise.all(webhooks.map((u) => sendWebhook(u, payload)));
    return;
  }

  // No está en vivo: exige varias comprobaciones seguidas para evitar falsos "terminó"
  if (!s.isLive) return;
  if (++s.misses < (defaults.offlineThreshold ?? 2)) return;

  s.isLive = false;
  s.misses = 0;
  log(`⚫ El LIVE de ${username} terminó`);

  if (cfg.onEnd?.enabled) {
    const vars = {
      username,
      url: `https://www.tiktok.com/@${username}`,
      duration: formatDuration(Date.now() - (s.startedAt || Date.now())),
    };
    const payload = buildPayload(
      { botName: cfg.botName, botAvatar: cfg.botAvatar, mode: 'message', ...cfg.onEnd },
      vars
    );
    await Promise.all(webhooks.map((u) => sendWebhook(u, payload)));
  }
  saveState();
}

let stopping = false;
async function loop() {
  while (!stopping) {
    const config = loadConfig();
    if (!config) {
      log('No hay config.json válido. Reintento en 30 s.');
      await sleep(30000);
      continue;
    }
    const defaults = { offlineThreshold: config.offlineThreshold, ...config.defaults };
    const creators = config.creators || [];
    log(`Verificando ${creators.length} creador(es)...`);

    // Secuencial con pausa: evita bloqueos por exceso de peticiones a TikTok
    for (const creator of creators) {
      if (stopping) break;
      await checkUser(creator, defaults).catch((e) => log(`Error inesperado: ${e.message}`));
      await sleep((config.delayBetweenChecksSeconds ?? 2) * 1000);
    }
    saveState();
    await sleep((config.checkIntervalMinutes ?? 2) * 60 * 1000);
  }
}

process.on('SIGINT', () => {
  stopping = true;
  saveState();
  log('Detenido.');
  process.exit(0);
});

log('Iniciando rastreador multi-usuario...');
loadLib()
  .then(loop)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
