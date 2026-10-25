#!/usr/bin/env node
'use strict';
// Migrador de config.json de TikTok Live Adviser: v1 <-> v2 (sin dependencias).
const fs = require('fs');
const path = require('path');

const GLOBAL_BASE = { checkIntervalMinutes: 2, delayBetweenChecksSeconds: 2, offlineThreshold: 2 };
const V2_ONLY = { jitterPercent: 30, stableThreshold: 3, backoffFactor: 2, maxIntervalMinutes: 15 };
const SERVER_DEFAULT = { host: '127.0.0.1', port: 3000, token: '' };
const KNOWN = new Set([...Object.keys(GLOBAL_BASE), ...Object.keys(V2_ONLY), 'server', 'defaults', 'creators']);

const usage = () => console.log(`Uso: node migrate-config.js <config.json> [opciones]

  --to v1|v2       Versión de destino (por defecto, la contraria a la detectada)
  --out <archivo>  Archivo de salida (por defecto <nombre>.<destino>.json junto al original)
  --in-place       Sobrescribe el archivo de entrada (deja una copia .bak)
  --dry-run        Solo muestra el informe, no escribe nada
  -h, --help       Muestra esta ayuda

Ejemplos:
  node migrate-config.js config.json                 # detecta la versión y genera config.v2.json (o v1)
  node migrate-config.js v1/config.json --to v2 --out v2/config.json
  node migrate-config.js config.json --in-place --to v1`);

const fail = (m) => { console.error('❌ ' + m); process.exit(1); };

function parseArgs(argv) {
  const a = { files: [] };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--to') a.to = (argv[++i] || '').toLowerCase();
    else if (x === '--out') a.out = argv[++i];
    else if (x === '--in-place') a.inPlace = true;
    else if (x === '--dry-run') a.dry = true;
    else if (x === '-h' || x === '--help') a.help = true;
    else a.files.push(x);
  }
  return a;
}

const detect = (raw) => (['jitterPercent', 'stableThreshold', 'backoffFactor', 'maxIntervalMinutes', 'server'].some((k) => k in raw) ? 'v2' : 'v1');

function migrate(raw, target, notes, warns) {
  const out = {};
  const missing = [];
  for (const [k, d] of Object.entries(GLOBAL_BASE)) { if (raw[k] === undefined) missing.push(k); out[k] = raw[k] ?? d; }
  if (missing.length) notes.push(`Valores por defecto aplicados: ${missing.join(', ')}.`);

  const v2Present = Object.keys(V2_ONLY).filter((k) => k in raw).concat('server' in raw ? ['server'] : []);
  if (target === 'v2') {
    const added = [];
    for (const [k, d] of Object.entries(V2_ONLY)) { if (raw[k] === undefined) added.push(k); out[k] = raw[k] ?? d; }
    if (raw.server === undefined) added.push('server');
    out.server = { ...SERVER_DEFAULT, ...(raw.server || {}) };
    if (added.length) notes.push(`Añadidos con valores por defecto de la v2: ${added.join(', ')}.`);
  } else if (v2Present.length) {
    warns.push(`Se descartan ajustes que no existen en la v1: ${v2Present.map((k) => `${k}=${JSON.stringify(raw[k])}`).join(', ')}.`);
    if (raw.server?.token) warns.push('El token del servidor se descarta (la v1 no tiene panel ni API).');
  }

  out.defaults = raw.defaults || {};
  if (!raw.defaults) warns.push('No hay "defaults": los creadores no heredarán mensaje ni embeds.');

  out.creators = (raw.creators || []).map((c, i) => {
    const o = { ...c };
    const name = String(o.tiktokUsername || `#${i + 1}`);
    if (typeof o.tiktokUsername === 'string' && o.tiktokUsername.trim().startsWith('@')) {
      o.tiktokUsername = o.tiktokUsername.trim().replace(/^@/, '');
      notes.push(`Creador "${name}": se quitó la @ del usuario.`);
    }
    if ('discordWebhookUrl' in o) {
      o.webhooks = [...new Set([...(Array.isArray(o.webhooks) ? o.webhooks : []), o.discordWebhookUrl].filter(Boolean))];
      delete o.discordWebhookUrl;
      notes.push(`Creador "${name}": discordWebhookUrl → webhooks.`);
    }
    if ('isLive' in o) { delete o.isLive; notes.push(`Creador "${name}": se quitó "isLive" (el estado lo guarda state.json).`); }
    if (!o.tiktokUsername) warns.push(`Creador ${name}: falta tiktokUsername.`);
    if (!Array.isArray(o.webhooks) || !o.webhooks.length) warns.push(`Creador ${name}: no tiene webhooks.`);
    else if (o.webhooks.some((w) => typeof w !== 'string' || w.includes('AQUÍ'))) warns.push(`Creador ${name}: tiene webhooks de ejemplo sin reemplazar.`);
    const { tiktokUsername, webhooks, ...rest } = o;
    return { tiktokUsername, webhooks, ...rest };
  });

  for (const k of Object.keys(raw)) {
    if (!KNOWN.has(k)) { out[k] = raw[k]; warns.push(`Clave desconocida conservada tal cual: "${k}".`); }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.files.length) return usage();
  const input = path.resolve(args.files[0]);
  let raw;
  try { raw = JSON.parse(fs.readFileSync(input, 'utf8')); } catch (e) { return fail(`No pude leer ${input}: ${e.message}`); }
  const notes = [], warns = [];
  if (Array.isArray(raw)) { raw = { creators: raw }; notes.push('El archivo era una lista de creadores: se envolvió en un config completo.'); }
  if (!raw || typeof raw !== 'object') return fail('El JSON debe ser un objeto.');
  if (raw.creators !== undefined && !Array.isArray(raw.creators)) return fail('"creators" debe ser una lista.');

  const from = detect(raw);
  const target = args.to || (from === 'v1' ? 'v2' : 'v1');
  if (!['v1', 'v2'].includes(target)) return fail('--to debe ser v1 o v2.');
  if (from === target) notes.push(`El archivo ya parece ${from}: solo se normaliza y ordena.`);

  const result = migrate(raw, target, notes, warns);
  console.log(`Detectado: ${from}  →  Destino: ${target}   (${result.creators.length} creador(es))`);
  notes.forEach((n) => console.log('  ✔ ' + n));
  warns.forEach((w) => console.log('  ⚠️ ' + w));
  if (args.dry) return console.log('\n(dry-run: no se escribió nada)');

  const outPath = args.inPlace ? input : path.resolve(args.out || input.replace(/\.json$/i, '') + `.${target}.json`);
  if (args.inPlace) fs.copyFileSync(input, input + '.bak');
  else if (fs.existsSync(outPath)) return fail(`${outPath} ya existe. Usa --out con otro nombre o --in-place.`);
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
  console.log(`\n✅ Escrito: ${outPath}${args.inPlace ? `  (copia en ${input}.bak)` : ''}`);
}
main();