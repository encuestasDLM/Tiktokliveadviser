# [Discord] TikTok Live Adviser

Script en Node.js que vigila a uno o varios creadores de TikTok y avisa por **webhook de Discord** en cuanto inician un LIVE. Los avisos son **100 % personalizables**: mensajes de texto, embeds completos o ambos, distintos para cada creador y servidor.

Este repositorio contiene **dos versiones independientes** y una **herramienta** para pasar tu configuración de una a otra.

## 🗂️ Contenido

| Carpeta | Qué es | Documentación |
|---|---|---|
| [`v1/`](v1/) | Versión sencilla: un script y un `config.json`, con un editor visual que se abre en el navegador. | [README de la v1](v1/README.md) |
| [`v2/`](v2/) | Versión ampliada: panel web servido por el propio script, API de estado, revisiones aleatorias y espaciado automático. | [README de la v2](v2/README.md) |
| [`tools/`](tools/) | Migrador de `config.json` entre v1 y v2 (en ambas direcciones). | [README de las herramientas](tools/README.md) |

```
.
├── README.md                  # Este índice
├── v1/
│   ├── index.js
│   ├── config.json
│   ├── editor-config.html     # Editor visual (se abre en el navegador)
│   ├── package.json
│   └── README.md
├── v2/
│   ├── index.js               # Script + servidor web + API
│   ├── config.json
│   ├── public/index.html      # Panel web (lo sirve el script)
│   ├── package.json
│   └── README.md
└── tools/
    ├── migrate-config.js
    └── README.md
```

## 🤔 ¿Cuál versión elegir?

- **Elige la v1** si quieres lo más simple: pocos archivos, sin servidor y sin nada que configurar aparte del JSON.
- **Elige la v2** si vas a dejarlo corriendo de forma continua: te da panel de edición, estado consultable por API, menos peticiones a TikTok y un ritmo de consultas menos predecible.

## ⚖️ Comparación

### Funciones

| | v1 | v2 |
|---|:---:|:---:|
| Varios creadores, cada uno con uno o varios webhooks | ✅ | ✅ |
| Mensajes y embeds totalmente personalizables, con variables | ✅ | ✅ |
| Valores por defecto con sobrescritura por creador | ✅ | ✅ |
| Aviso de fin de LIVE (`onEnd`) | ✅ | ✅ |
| Confirmación de fin de LIVE (`offlineThreshold`) | ✅ | ✅ |
| Estado persistente en `state.json` (no repite avisos al reiniciar) | ✅ | ✅ |
| Reintento automático si Discord limita las peticiones (429) | ✅ | ✅ |
| Recarga del `config.json` sin reiniciar | ✅ (cada ciclo) | ✅ (al instante) |
| Editor visual con previsualización estilo Discord | ✅ (archivo HTML aparte) | ✅ (integrado) |
| Panel servido por el propio script | ❌ | ✅ |
| Cargar y guardar la config desde el panel | ❌ | ✅ |
| Botón para enviar un aviso de prueba | ❌ | ✅ |
| Endpoint API con el estado del servicio (`/api/status`) | ❌ | ✅ |
| Revisiones con tiempos aleatorios (`jitterPercent`) | ❌ | ✅ |
| Espaciado automático de creadores sin cambios | ❌ | ✅ |
| Espaciado ante errores seguidos (por ejemplo, bloqueos de IP) | ❌ | ✅ |
| Autenticación por token para los endpoints que editan la config | ❌ | ✅ |

### Funcionamiento

| | v1 | v2 |
|---|---|---|
| Programación de revisiones | Un ciclo global cada `checkIntervalMinutes`. | Un reloj por creador, con intervalo propio. |
| Frecuencia por creador | Fija. | Variable: base ± aleatoriedad, y más espaciada si el estado no cambia. |
| Servidor web | No. | Sí (`127.0.0.1:3000` por defecto). |
| Dependencias | `tiktok-live-connector`, `axios` | `tiktok-live-connector` |
| Uso de recursos | Mínimo. | Mínimo, más un servidor HTTP ligero. |
| Detección de un LIVE nuevo | Hasta un intervalo (por defecto, 2 min). | Hasta un intervalo; si el creador estaba en espaciado, hasta `maxIntervalMinutes` (15 min por defecto). |

### Configuración (`config.json`)

| Ajuste | v1 | v2 |
|---|:---:|:---:|
| `checkIntervalMinutes`, `delayBetweenChecksSeconds`, `offlineThreshold` | ✅ | ✅ |
| `defaults` y `creators` (mensajes, embeds, webhooks, `onEnd`…) | ✅ | ✅ |
| `jitterPercent` | ❌ | ✅ |
| `stableThreshold`, `backoffFactor`, `maxIntervalMinutes` | ❌ | ✅ |
| `server` (`host`, `port`, `token`) | ❌ | ✅ |

La estructura de `defaults` y de cada creador es **la misma** en ambas versiones, así que tus mensajes y embeds son totalmente portables.

## 🚀 Inicio rápido

Requisitos: **Node.js 18 o superior**. Instala siempre las dependencias **dentro de la carpeta de la versión** que uses.

```bash
git clone https://github.com/encuestasDLM/Tiktokliveadviser.git
cd Tiktokliveadviser
```

**v1**

```bash
cd v1
npm install
node index.js
```

**v2**

```bash
cd v2
npm install
node index.js
# Panel: http://127.0.0.1:3000   ·   Estado: http://127.0.0.1:3000/api/status
```

Los detalles de cada una (parámetros, variables, ejemplos y cómo funcionan por dentro) están en su README.

## 🔄 Pasar de una versión a otra

Con el migrador, desde la raíz del repositorio:

```bash
# v1 → v2
node tools/migrate-config.js v1/config.json --to v2 --out v2/config.json

# v2 → v1
node tools/migrate-config.js v2/config.json --to v1 --out v1/config.json
```

Detecta la versión, conserva tus mensajes, embeds y webhooks, añade o descarta solo los ajustes propios de cada versión y te avisa de todo lo que hace. Más información en el [README de las herramientas](tools/README.md).

## ⚠️ Notas importantes

- **No ejecutes la v1 y la v2 a la vez con los mismos creadores y webhooks:** cada una avisaría por su cuenta y Discord recibiría los avisos duplicados. Cada versión guarda además su propio `state.json`.
- Una configuración de la v1 funciona en la v2 (los ajustes nuevos toman sus valores por defecto) y viceversa (la v1 ignora lo que no conoce). Aun así, usa el migrador para dejar los archivos limpios y para convertir el antiguo `discordWebhookUrl`.

## ⚠️ Aviso

Este proyecto usa [`tiktok-live-connector`](https://github.com/zerodytrash/TikTok-Live-Connector), una librería **no oficial** que no está afiliada a TikTok. TikTok puede cambiar su sistema en cualquier momento y romper el funcionamiento hasta que la librería se actualice; si pasa, prueba primero con `npm update tiktok-live-connector`. TikTok también suele limitar las IPs de servidores y centros de datos, por lo que lo más estable es ejecutarlo desde un equipo con IP residencial.

## 📄 Licencia

Consulta el archivo `LICENSE` del repositorio.