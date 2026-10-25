# 🔄 Migrador de configuración · TikTok Live Adviser

> [← Índice del proyecto](../README.md) · [v1](../v1/README.md) · [v2](../v2/README.md)

Herramienta de línea de comandos que convierte tu `config.json` entre la **v1** y la **v2** de **\[Discord\] TikTok Live Adviser**, en **cualquier dirección** (v1 → v2 y v2 → v1). Mantiene tus creadores, webhooks, mensajes y embeds, y te informa de todo lo que añade, cambia o descarta.

- Un solo archivo, **sin dependencias** (solo Node.js 18 o superior).
- Detecta la versión del archivo automáticamente.
- **Nunca sobrescribe** nada por accidente: genera un archivo nuevo, o hace copia `.bak` si usas `--in-place`.
- Modo `--dry-run` para ver el informe sin escribir nada.

## 🚀 Uso

Desde la raíz del repositorio:

```bash
node tools/migrate-config.js <config.json> [opciones]
```

| Opción | Descripción |
|---|---|
| `--to v1` \| `--to v2` | Versión de destino. Si no la indicas, convierte a la contraria de la detectada. |
| `--out <archivo>` | Archivo de salida. Por defecto: `<nombre>.<destino>.json` junto al original (por ejemplo `config.v2.json`). |
| `--in-place` | Sobrescribe el archivo de entrada y deja una copia `<archivo>.bak`. |
| `--dry-run` | Solo muestra el informe; no escribe nada. |
| `-h`, `--help` | Muestra la ayuda. |

### Ejemplos

```bash
# Detecta la versión y genera config.v2.json (o config.v1.json) al lado del original
node tools/migrate-config.js v1/config.json

# v1 → v2 escribiendo directamente en la carpeta de la v2
node tools/migrate-config.js v1/config.json --to v2 --out v2/config.json

# v2 → v1
node tools/migrate-config.js v2/config.json --to v1 --out v1/config.json

# Ver qué cambiaría sin tocar nada
node tools/migrate-config.js v1/config.json --dry-run

# Convertir el mismo archivo (guarda config.json.bak)
node tools/migrate-config.js config.json --in-place --to v2
```

### Ejemplo de salida

```
Detectado: v1  →  Destino: v2   (2 creador(es))
  ✔ Añadidos con valores por defecto de la v2: jitterPercent, stableThreshold, backoffFactor, maxIntervalMinutes, server.
  ⚠️ Creador primer_tiktoker: tiene webhooks de ejemplo sin reemplazar.

✅ Escrito: /ruta/al/proyecto/config.v2.json
```

Las líneas con ✔ son cambios hechos; las líneas con ⚠️ son avisos que conviene revisar.

## 🔍 Cómo detecta la versión

Si el archivo contiene alguno de estos ajustes, se considera **v2**; si no, **v1**:

`jitterPercent` · `stableThreshold` · `backoffFactor` · `maxIntervalMinutes` · `server`

Con `--to` puedes forzar el destino. Si el archivo ya es de la versión pedida, solo se **normaliza y ordena**.

## 🧩 Qué cambia en cada dirección

| Ajuste | v1 | v2 | v1 → v2 | v2 → v1 |
|---|:---:|:---:|---|---|
| `checkIntervalMinutes`, `delayBetweenChecksSeconds`, `offlineThreshold` | ✅ | ✅ | Se conservan | Se conservan |
| `jitterPercent` | ❌ | ✅ | Se añade (`30`) | Se descarta (con aviso) |
| `stableThreshold` | ❌ | ✅ | Se añade (`3`) | Se descarta (con aviso) |
| `backoffFactor` | ❌ | ✅ | Se añade (`2`) | Se descarta (con aviso) |
| `maxIntervalMinutes` | ❌ | ✅ | Se añade (`15`) | Se descarta (con aviso) |
| `server` (host, puerto, token) | ❌ | ✅ | Se añade (`127.0.0.1:3000`, sin token) | Se descarta (con aviso) |
| `defaults` (mensaje, embeds, `onEnd`…) | ✅ | ✅ | Se conserva tal cual | Se conserva tal cual |
| `creators` | ✅ | ✅ | Se conservan con todos sus ajustes propios | Se conservan con todos sus ajustes propios |

Si un valor ya existía en el archivo de origen, **se respeta**; los valores por defecto solo se usan para lo que falta.

### Limpieza que se aplica siempre

| Situación | Resultado |
|---|---|
| Creador con el antiguo `discordWebhookUrl` | Se convierte en `webhooks` (lista, sin duplicados). |
| Usuario escrito con `@` (`@creador`) | Se guarda sin `@`. |
| Campo `isLive` heredado del primer script | Se elimina (el estado vive en `state.json`). |
| Archivo que es solo una lista de creadores | Se envuelve en un config completo. |
| Claves desconocidas | Se conservan tal cual y se avisa. |

### Avisos que genera

- Creador sin `tiktokUsername` o sin webhooks.
- Webhooks de ejemplo sin reemplazar (`AQUÍ…`).
- Falta el bloque `defaults` (los creadores no heredarían mensaje ni embeds).
- En v2 → v1: lista exacta de ajustes descartados y, si había token de servidor, que se pierde.

## ✅ Ida y vuelta

Convertir v1 → v2 → v1 deja el archivo **idéntico al original**. En sentido contrario (v2 → v1 → v2) se pierden los ajustes propios de la v2, que vuelven a sus valores por defecto: haz una copia de tu config de la v2 antes de bajar de versión.

## 💡 Flujos habituales

**Pasarte de la v1 a la v2**

```bash
node tools/migrate-config.js v1/config.json --to v2 --out v2/config.json
cd v2 && npm install && node index.js
```

Luego ajusta en el panel (`http://127.0.0.1:3000`) los tiempos nuevos si quieres.

**Volver a la v1**

```bash
cp v2/config.json v2/config.backup.json
node tools/migrate-config.js v2/config.json --to v1 --out v1/config.json
```

> La v2 también puede leer directamente un `config.json` de la v1 (rellena con valores por defecto lo que falte), y la v1 ignora los ajustes extra de la v2. El migrador sirve para dejar los archivos limpios y para tratar el antiguo `discordWebhookUrl`, que la v2 ya no lee.

## 🆘 Errores comunes

| Mensaje | Qué hacer |
|---|---|
| `No pude leer ...: ENOENT` | La ruta del archivo está mal; revisa desde qué carpeta ejecutas el comando. |
| `... ya existe. Usa --out con otro nombre o --in-place.` | Ya hay un archivo de salida: elige otro nombre o usa `--in-place`. |
| `"creators" debe ser una lista.` | El campo `creators` del JSON no es un arreglo `[ ... ]`. |
| `El JSON debe ser un objeto.` | El archivo no es un config válido (revisa comas y llaves). |

El migrador termina con código de salida `1` cuando hay un error, por lo que puedes usarlo dentro de scripts.

## 📄 Licencia

Consulta el archivo `LICENSE` del repositorio.