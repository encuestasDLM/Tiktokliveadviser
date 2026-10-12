# [Discord] TikTok Live Adviser

Script en Node.js que vigila a uno o varios creadores de TikTok y avisa por **webhook de Discord** en cuanto inician un LIVE. Los avisos son **100 % personalizables**: mensajes de texto, embeds completos o ambos, distintos para cada creador y para cada servidor.

Incluye un **editor web interactivo** con previsualización estilo Discord para armar el `config.json` sin escribir JSON a mano.

## ✨ Características

- Vigila a tantos creadores como quieras, cada uno con uno o varios webhooks.
- Mensajes y embeds totalmente personalizables, con variables (`{username}`, `{title}`, `{viewers}`…).
- Valores por defecto globales que cada creador puede sobrescribir.
- Aviso opcional cuando el LIVE termina (con la duración).
- `config.json` se relee en cada ciclo: **no hace falta reiniciar** para aplicar cambios.
- Guarda el estado en `state.json`, así que no repite avisos si reinicias el script.
- Reintenta automáticamente cuando Discord limita las peticiones (error 429).
- Un fallo de red no cuenta como "LIVE terminado" (se necesitan varias revisiones seguidas sin LIVE).

## 📁 Estructura

```
.
├── index.js             # Script principal
├── config.json          # Tu configuración (creadores, webhooks, mensajes, embeds)
├── editor-config.html   # Editor visual con previsualización (se abre en el navegador)
├── package.json
└── README.md
```

## 🚀 Instalación y arranque

Requisitos: **Node.js 18 o superior**.

Instala las dependencias **dentro de la carpeta del proyecto** (así no se mezclan con otras carpetas ni con tu carpeta personal):

```bash
git clone https://github.com/encuestasDLM/Tiktokliveadviser.git
cd Tiktokliveadviser
npm install
```

> Si empiezas desde cero sin `package.json`, ejecuta primero `npm init -y` dentro de la carpeta y luego `npm install tiktok-live-connector axios`. Fíjate en que el comando se corra **dentro** del proyecto: npm instala en el `package.json` o `node_modules` más cercano que encuentre hacia arriba.

Edita `config.json` (a mano o con el editor web) y arranca:

```bash
node index.js
```

Para detenerlo, `Ctrl + C`.

### Mantenerlo corriendo en segundo plano (opcional)

```bash
npm install -g pm2
pm2 start index.js --name tiktok-live-adviser
pm2 save
```

## 🖥️ Editor visual

Abre `editor-config.html` en tu navegador (doble clic, no necesita servidor):

1. Elige **Global / por defecto** o un tiktoker en la barra lateral.
2. Edita mensaje, embeds, colores, campos, menciones y demás. La previsualización se actualiza al instante.
3. Pulsa **Copiar config.json** y pégalo en tu archivo `config.json`.

También puedes importar un `config.json` existente con "Importar un config.json existente". Las imágenes de la previsualización se muestran como recuadros de ejemplo; en Discord aparecerán las reales.

## ⚙️ Configuración (`config.json`)

### Parámetros globales

| Parámetro | Descripción | Por defecto |
|---|---|---|
| `checkIntervalMinutes` | Cada cuántos minutos se revisa a todos los creadores. | `2` |
| `delayBetweenChecksSeconds` | Pausa entre la revisión de un creador y la del siguiente (evita bloqueos por exceso de peticiones). | `2` |
| `offlineThreshold` | Revisiones consecutivas sin LIVE necesarias para dar el LIVE por terminado. | `2` |
| `defaults` | Valores que heredan todos los creadores (ver tabla siguiente). | — |
| `creators` | Lista de creadores a vigilar. | — |

### Opciones de `defaults` y de cada creador

Todo lo que pongas en un creador **sobrescribe** el valor de `defaults`; lo que omitas se hereda.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `tiktokUsername` | string | Usuario de TikTok **sin** `@`. *(Solo en creadores)* |
| `webhooks` | string[] | Una o varias URLs de webhook de Discord. *(Solo en creadores)* |
| `mode` | `"message"` \| `"embed"` \| `"both"` | Qué se envía: solo texto, solo embeds o ambos. |
| `botName` | string | Nombre con el que aparece el aviso en Discord. |
| `botAvatar` | string | URL del avatar con el que se envía el aviso (opcional). |
| `mention` | string | Mención al inicio del mensaje: `@everyone`, `@here` o `<@&ID_DEL_ROL>`. |
| `message` | string | Texto del mensaje (admite Markdown de Discord y variables). |
| `embeds` | object[] | Hasta 10 embeds. Admite todos los campos de embed de Discord: `title`, `description`, `url`, `color` (número decimal), `author`, `thumbnail`, `image`, `fields`, `footer`, `timestamp`. |
| `onEnd` | object | Aviso al terminar el LIVE: `{ "enabled": true, "message": "..." }`. |

> **Obtener el ID de un rol:** activa el modo desarrollador en Discord, clic derecho sobre el rol → *Copiar ID*, y usa `<@&ID>`.

### Variables disponibles

Puedes usarlas en cualquier texto del mensaje y de los embeds (título, descripción, campos, URLs, etc.).

| Variable | Valor |
|---|---|
| `{username}` | Usuario de TikTok del creador. |
| `{url}` | Enlace directo al LIVE. |
| `{title}` | Título del LIVE. |
| `{viewers}` | Espectadores en el momento del aviso. |
| `{cover}` | URL de la portada del LIVE. |
| `{avatar}` | URL de la foto de perfil del creador. |
| `{time}` | Hora local de inicio. |
| `{iso}` | Fecha/hora ISO (úsala en `timestamp` de un embed). |
| `{duration}` | Duración del LIVE *(solo en el aviso de fin)*. |

### Ejemplo

```json
{
  "checkIntervalMinutes": 2,
  "delayBetweenChecksSeconds": 2,
  "offlineThreshold": 2,
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

1. Cada `checkIntervalMinutes` el script recorre la lista de creadores, uno por uno y con una pausa entre ellos.
2. Para cada uno consulta a TikTok si tiene un LIVE activo (con [`tiktok-live-connector`](https://github.com/zerodytrash/TikTok-Live-Connector)).
3. Si el creador **pasa de no estar en vivo a estarlo**, arma el aviso: rellena las variables, aplica `mode` y manda el resultado a cada webhook.
4. Si deja de estar en vivo durante `offlineThreshold` revisiones seguidas, lo marca como terminado y, si `onEnd.enabled` es `true`, envía el aviso de fin.
5. El estado de cada creador se guarda en `state.json` para no duplicar avisos al reiniciar.

## ⚠️ Aviso

Este proyecto usa [`tiktok-live-connector`](https://github.com/zerodytrash/TikTok-Live-Connector), una librería **no oficial** que no está afiliada a TikTok. TikTok puede cambiar su sistema en cualquier momento y romper el funcionamiento hasta que la librería se actualice. Si algo deja de funcionar, prueba primero con `npm update tiktok-live-connector`.

## 📄 Licencia

MIT
