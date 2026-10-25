# [Discord] TikTok Live Adviser · v2

Script en Node.js que vigila a uno o varios creadores de TikTok y avisa por **webhook de Discord** en cuanto inician un LIVE. Los avisos son **100 % personalizables**: mensajes de texto, embeds completos o ambos, distintos para cada creador y servidor.

La **v2** es independiente de la v1 (vive en su propia carpeta) y añade un panel web integrado, una API de estado, revisiones con tiempos aleatorios y un sistema que espacia las consultas de los creadores cuyo estado no cambia.

## ✨ Novedades de la v2

| | v1 | v2 |
|---|:---:|:---:|
| Avisos con mensaje y embeds personalizables | ✅ | ✅ |
| Aviso de fin de LIVE | ✅ | ✅ |
| Panel web servido por el propio script | ❌ | ✅ |
| Cargar y guardar la config desde el panel | ❌ | ✅ |
| Botón para enviar un aviso de prueba | ❌ | ✅ |
| Endpoint API con el estado del servicio | ❌ | ✅ |
| Revisiones con tiempos aleatorios | ❌ | ✅ |
| Espaciado automático de creadores sin cambios | ❌ | ✅ |
| Espaciado ante errores seguidos (bloqueos de TikTok) | ❌ | ✅ |
| Dependencias | `tiktok-live-connector`, `axios` | solo `tiktok-live-connector` |

## 📁 Estructura

```
v2/
├── index.js          # Script principal + servidor web + API
├── config.json       # Configuración (creadores, webhooks, mensajes, embeds, tiempos)
├── package.json
├── public/
│   └── index.html    # Panel web (editor con previsualización estilo Discord)
└── README.md
```

## 🚀 Instalación y arranque

Requisitos: **Node.js 18 o superior**.

Instala siempre las dependencias **dentro de la carpeta `v2`**:

```bash
git clone https://github.com/encuestasDLM/Tiktokliveadviser.git
cd Tiktokliveadviser/v2
npm install
node index.js
```

Al arrancar verás algo así:

```
Config cargada: 1 creador(es).
🌐 Panel en http://127.0.0.1:3000  ·  API de estado: /api/status
TikTok Live Adviser v2.0.0 iniciado
```

Abre `http://127.0.0.1:3000` en tu navegador para usar el panel. Para detenerlo, `Ctrl + C`.

> En Codespaces u otro servidor remoto, el panel se abre desde el reenvío del puerto 3000 (pestaña *Ports*).

### Mantenerlo corriendo en segundo plano (opcional)

```bash
npm install -g pm2
pm2 start index.js --name tiktok-live-adviser-v2
pm2 save
```

## 🖥️ Panel web

El script sirve el editor en la raíz (`/`). Desde ahí puedes:

1. **⬇ Cargar del servidor:** trae el `config.json` actual al editor.
2. Editar mensajes, embeds, colores, campos, menciones, tiempos y creadores, con previsualización en vivo.
3. **⬆ Guardar en servidor:** valida y guarda el `config.json`. El script lo aplica solo, **sin reiniciar**, y deja una copia en `config.json.bak`.
4. **🧪 Enviar prueba:** manda el aviso de un tiktoker a sus webhooks para ver cómo queda en Discord (hay que guardar antes).
5. **Copiar config.json:** si prefieres pegarlo a mano en el archivo.

En la barra lateral se muestra el estado del servicio en vivo: quién está en LIVE, cuándo se revisará de nuevo cada creador y cada cuánto, y el último error si lo hubo.

Las imágenes de la previsualización se muestran como recuadros de ejemplo; en Discord aparecerán las reales.

## 🔌 API

| Método | Ruta | Descripción | Requiere token |
|---|---|---|:---:|
| `GET` | `/` | Panel web. | No |
| `GET` | `/api/status` | Estado del servicio (JSON). Pensado para monitores de uptime o dashboards. No incluye webhooks. | No |
| `GET` | `/api/config` | Devuelve el `config.json`. | Sí* |
| `PUT` | `/api/config` | Valida y guarda un nuevo `config.json` (cuerpo: el JSON completo). | Sí* |
| `POST` | `/api/test` | Envía un aviso de prueba. Cuerpo: `{ "username": "creador" }`. | Sí* |

\* **Acceso a los endpoints protegidos:**
- Con `server.token` o la variable `ADMIN_TOKEN` definidos, hay que enviar `Authorization: Bearer <token>`. Sin él responde `401`.
- Sin token, solo funcionan si el servidor escucha en `127.0.0.1`/`localhost`. Si abres el servidor a la red (`HOST=0.0.0.0`) sin token, responden `403`.

### Ejemplo de `GET /api/status`

```bash
curl http://127.0.0.1:3000/api/status
```

```json
{
  "service": "tiktok-live-adviser",
  "version": "2.0.0",
  "ok": true,
  "now": "2026-10-25T18:30:00.000Z",
  "startedAt": "2026-10-25T17:00:00.000Z",
  "uptimeSec": 5400,
  "stats": { "checks": 120, "errors": 2, "alertsSent": 3 },
  "settings": {
    "checkIntervalMinutes": 2, "jitterPercent": 30, "stableThreshold": 3,
    "backoffFactor": 2, "maxIntervalMinutes": 15, "offlineThreshold": 2
  },
  "creators": [
    {
      "username": "primer_tiktoker",
      "isLive": true,
      "liveSince": "2026-10-25T18:05:00.000Z",
      "lastCheckAt": "2026-10-25T18:29:10.000Z",
      "nextCheckAt": "2026-10-25T18:31:20.000Z",
      "intervalSec": 120,
      "stableChecks": 0,
      "errorStreak": 0,
      "lastError": null,
      "checks": 60,
      "errors": 0,
      "webhooks": 1
    }
  ]
}
```

### Ejemplos con token

```bash
# Descargar la config
curl -H "Authorization: Bearer TU_TOKEN" http://127.0.0.1:3000/api/config

# Enviar un aviso de prueba
curl -X POST -H "Authorization: Bearer TU_TOKEN" \
     -d '{"username":"primer_tiktoker"}' http://127.0.0.1:3000/api/test
```

## ⏱️ Revisiones aleatorias y espaciado

**Tiempos aleatorios.** Cada revisión se programa con el intervalo base ± `jitterPercent`. Con base de 2 minutos y 30 %, la próxima revisión cae entre 1,4 y 2,6 minutos. La pausa entre un creador y otro también es aleatoria (entre el 50 % y el 150 % de `delayBetweenChecksSeconds`).

**Espaciado automático.** Si el estado de un creador (en vivo / no en vivo) no cambia durante `stableThreshold` revisiones seguidas, el script deja de preguntar tan seguido: multiplica su intervalo por `backoffFactor` en cada revisión estable, hasta `maxIntervalMinutes`. En cuanto el estado cambia, vuelve al intervalo normal.

Ejemplo con los valores por defecto (base 2 min, umbral 3, factor 2, máximo 15 min):

| Revisión estable nº | 1 | 2 | 3 | 4 | 5+ |
|---|---|---|---|---|---|
| Próxima revisión en | 2 min | 2 min | 4 min | 8 min | 15 min |

**Espaciado ante errores.** Si TikTok no responde varias veces seguidas (por ejemplo, por un bloqueo de IP), el intervalo se duplica en cada error hasta el máximo, en vez de insistir cada 2 minutos.

> El espaciado reduce las peticiones, pero retrasa la detección de un LIVE nuevo hasta el intervalo máximo. Baja `maxIntervalMinutes` si prefieres detectarlos antes, o pon `stableThreshold` en `0` para desactivarlo.

## ⚙️ Configuración (`config.json`)

### Parámetros globales

| Parámetro | Descripción | Por defecto |
|---|---|---|
| `checkIntervalMinutes` | Intervalo base entre revisiones de un mismo creador (mínimo 0,5). | `2` |
| `delayBetweenChecksSeconds` | Pausa media entre la revisión de un creador y la del siguiente. | `2` |
| `offlineThreshold` | Revisiones consecutivas sin LIVE necesarias para dar el LIVE por terminado. | `2` |
| `jitterPercent` | Aleatoriedad del intervalo, en ± % (0–90). | `30` |
| `stableThreshold` | Revisiones sin cambio de estado antes de empezar a espaciar. `0` lo desactiva. | `3` |
| `backoffFactor` | Multiplicador del intervalo en cada revisión estable (y base del espaciado por errores). | `2` |
| `maxIntervalMinutes` | Intervalo máximo al espaciar. Nunca baja del intervalo base. | `15` |
| `server` | Ajustes del servidor web (ver abajo). | — |
| `defaults` | Valores que heredan todos los creadores. | — |
| `creators` | Lista de creadores a vigilar. | — |

### Servidor (`server`)

| Parámetro | Variable de entorno | Descripción | Por defecto |
|---|---|---|---|
| `host` | `HOST` | Dirección en la que escucha. Usa `0.0.0.0` para aceptar conexiones externas. | `127.0.0.1` |
| `port` | `PORT` | Puerto del panel y la API. | `3000` |
| `token` | `ADMIN_TOKEN` | Token para los endpoints protegidos. | vacío |

Las variables de entorno tienen prioridad sobre el `config.json`. Los cambios en `server` requieren reiniciar el script; el resto de la configuración se aplica sola.

```bash
PORT=8080 ADMIN_TOKEN=un_token_largo node index.js
```

### Opciones de `defaults` y de cada creador

Todo lo que pongas en un creador **sobrescribe** el valor de `defaults`; lo que omitas se hereda.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `tiktokUsername` | string | Usuario de TikTok **sin** `@`. *(Solo en creadores)* |
| `webhooks` | string[] | Una o varias URLs de webhook de Discord (deben empezar por `https://`). *(Solo en creadores)* |
| `mode` | `"message"` \| `"embed"` \| `"both"` | Qué se envía: solo texto, solo embeds o ambos. |
| `botName` | string | Nombre con el que aparece el aviso en Discord. |
| `botAvatar` | string | URL del avatar con el que se envía el aviso (opcional). |
| `mention` | string | Mención al inicio del mensaje: `@everyone`, `@here` o `<@&ID_DEL_ROL>`. |
| `message` | string | Texto del mensaje (admite Markdown de Discord y variables). |
| `embeds` | object[] | Hasta 10 embeds con todos los campos de Discord: `title`, `description`, `url`, `color` (número decimal), `author`, `thumbnail`, `image`, `fields`, `footer`, `timestamp`. |
| `onEnd` | object | Aviso al terminar el LIVE: `{ "enabled": true, "message": "..." }`. |

> **Obtener el ID de un rol:** activa el modo desarrollador en Discord, clic derecho sobre el rol → *Copiar ID*, y usa `<@&ID>`.

### Variables disponibles

Puedes usarlas en cualquier texto del mensaje y de los embeds.

| Variable | Valor |
|---|---|
| `{username}` | Usuario de TikTok del creador. |
| `{url}` | Enlace directo al LIVE. |
| `{title}` | Título del LIVE. |
| `{viewers}` | Espectadores en el momento del aviso. |
| `{cover}` | URL de la portada del LIVE. |
| `{avatar}` | URL de la foto de perfil del creador. |
| `{time}` | Hora local de inicio. |
| `{iso}` | Fecha/hora ISO (úsala en el `timestamp` de un embed). |
| `{duration}` | Duración del LIVE *(solo en el aviso de fin)*. |

### Ejemplo

```json
{
  "checkIntervalMinutes": 2,
  "delayBetweenChecksSeconds": 2,
  "offlineThreshold": 2,
  "jitterPercent": 30,
  "stableThreshold": 3,
  "backoffFactor": 2,
  "maxIntervalMinutes": 15,
  "server": { "host": "127.0.0.1", "port": 3000, "token": "" },
  "defaults": {
    "mode": "both",
    "botName": "Alerta TikTok LIVE",
    "message": "🚨 **¡{username} acaba de iniciar un LIVE!**\n{url}",
    "embeds": [
      {
        "title": "🔴 {username} está en vivo",
        "description": "{title}",
        "url": "{url}",
        "color": 16711758,
        "image": { "url": "{cover}" },
        "footer": { "text": "TikTok LIVE" },
        "timestamp": "{iso}"
      }
    ],
    "onEnd": { "enabled": false, "message": "⚫ El LIVE de **{username}** terminó (duró {duration})." }
  },
  "creators": [
    {
      "tiktokUsername": "primer_tiktoker",
      "webhooks": ["https://discord.com/api/webhooks/ID/TOKEN"]
    },
    {
      "tiktokUsername": "segundo_tiktoker",
      "webhooks": ["https://discord.com/api/webhooks/ID_A/TOKEN_A", "https://discord.com/api/webhooks/ID_B/TOKEN_B"],
      "mode": "message",
      "mention": "@everyone",
      "message": "¡Corran! {username} está en directo: {url}",
      "onEnd": { "enabled": true, "message": "Se acabó el live de {username} 👋" }
    }
  ]
}
```

## 🔧 Cómo funciona

1. Al arrancar, el script carga `config.json`, abre el servidor web y empieza a revisar a los creadores.
2. Cada creador tiene su propio reloj: se revisa cuando le toca, uno por uno y con una pausa aleatoria entre ellos.
3. Para cada revisión consulta a TikTok si hay un LIVE activo (con [`tiktok-live-connector`](https://github.com/zerodytrash/TikTok-Live-Connector)).
4. Si el creador **pasa de no estar en vivo a estarlo**, arma el aviso: rellena las variables, aplica `mode` y lo manda a cada webhook (con reintento automático si Discord limita las peticiones).
5. Si deja de estar en vivo durante `offlineThreshold` revisiones seguidas, lo marca como terminado y, si `onEnd.enabled` es `true`, envía el aviso de fin.
6. Después de cada revisión se calcula la siguiente: intervalo base, espaciado si el estado es estable o hay errores, y un ± aleatorio.
7. El estado (quién está en LIVE) se guarda en `state.json` para no duplicar avisos al reiniciar. Si editas `config.json` a mano o desde el panel, los cambios se detectan solos.

## ⚠️ Aviso

Este proyecto usa [`tiktok-live-connector`](https://github.com/zerodytrash/TikTok-Live-Connector), una librería **no oficial** que no está afiliada a TikTok. TikTok puede cambiar su sistema en cualquier momento y romper el funcionamiento hasta que la librería se actualice; si pasa, prueba primero con `npm update tiktok-live-connector`. Además, TikTok suele limitar las IPs de servidores y centros de datos: si lo ejecutas en la nube y ves errores seguidos en `/api/status`, es la causa más probable.

## 📄 Licencia

Consulta el archivo `LICENSE` del repositorio.
