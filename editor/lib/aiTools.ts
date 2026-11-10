import type Anthropic from "@anthropic-ai/sdk";

/** Tools the AI editor can call. They are executed in the user's browser (see lib/aiExecutor.ts). */

const range = {
  type: "object",
  properties: {
    start: { type: "number", description: "Segundos en la línea de tiempo" },
    end: { type: "number", description: "Segundos en la línea de tiempo" },
  },
  required: ["start", "end"],
} as const;

const position = {
  type: "string",
  enum: ["center", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right"],
} as const;

const animation = {
  type: "string",
  enum: ["none", "fade", "pop", "slide_up", "typewriter"],
  description: "Animación de entrada. typewriter solo para textos.",
} as const;

const subtitleStyleProps = {
  preset: {
    type: "string",
    enum: ["tiktok", "clasico", "karaoke", "minimal", "neon"],
    description:
      "tiktok: mayúsculas grandes con la palabra activa resaltada, 3 palabras. clasico: caja negra abajo. karaoke: palabra activa con fondo de color. minimal: limpio con sombra. neon: brillo de color.",
  },
  color: { type: "string", description: "Color del texto en hex, ej. #ffffff" },
  highlight: { type: "string", description: "Color de la palabra activa en hex" },
  position: { type: "string", enum: ["top", "middle", "bottom"] },
  uppercase: { type: "boolean" },
  background: { type: "boolean", description: "Caja oscura detrás del texto" },
  fontSize: { type: "number", description: "Tamaño en px a 720p (14–100). Normal: 30–55" },
  wordsPerCue: { type: "number", description: "Palabras por línea de subtítulo (1–15)" },
} as const;

export const AI_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "get_transcript",
    description:
      "Transcribe (si hace falta) el audio de los videos de la línea de tiempo y devuelve el texto hablado con marcas de tiempo de la línea de tiempo. Úsalo antes de decidir cortes por contenido, colocar elementos en momentos concretos de lo que se dice, o elegir los mejores momentos. Tarda un poco la primera vez.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "add_subtitles",
    description:
      "Genera subtítulos automáticos a partir de la voz del video (reemplaza los existentes) y aplica un estilo. Transcribe automáticamente si hace falta.",
    input_schema: {
      type: "object",
      properties: {
        ...subtitleStyleProps,
        language: {
          type: "string",
          description: "Idioma hablado en inglés para Whisper, ej. 'spanish', 'english', 'portuguese'. Por defecto 'spanish'.",
        },
      },
    },
  },
  {
    name: "style_subtitles",
    description: "Cambia el estilo de los subtítulos existentes sin regenerarlos.",
    input_schema: { type: "object", properties: { ...subtitleStyleProps } },
  },
  {
    name: "edit_subtitle_text",
    description: "Corrige el texto de líneas de subtítulos concretas (por ejemplo, errores de transcripción o nombres propios).",
    input_schema: {
      type: "object",
      properties: {
        find: { type: "string", description: "Texto a buscar en los subtítulos" },
        replace: { type: "string", description: "Texto de reemplazo" },
      },
      required: ["find", "replace"],
    },
  },
  {
    name: "remove_silences",
    description:
      "Detecta y elimina automáticamente las pausas y silencios del audio (jump cuts). Todo lo demás se reajusta.",
    input_schema: {
      type: "object",
      properties: {
        min_silence_seconds: { type: "number", description: "Silencio mínimo a cortar. Por defecto 0.6" },
        padding_seconds: { type: "number", description: "Margen que se deja antes y después de la voz. Por defecto 0.12" },
      },
    },
  },
  {
    name: "cut_ranges",
    description:
      "Elimina tramos de la línea de tiempo (ripple delete). Usa tiempos de la línea de tiempo ACTUAL. Útil para quitar errores, muletillas, repeticiones o partes aburridas.",
    input_schema: {
      type: "object",
      properties: { ranges: { type: "array", items: range } },
      required: ["ranges"],
    },
  },
  {
    name: "keep_only_ranges",
    description:
      "Conserva solo los tramos indicados y elimina el resto. Útil para hacer un resumen, un clip corto o 'los mejores momentos'.",
    input_schema: {
      type: "object",
      properties: { ranges: { type: "array", items: range } },
      required: ["ranges"],
    },
  },
  {
    name: "add_image",
    description: "Superpone una foto/imagen subida por el usuario sobre el video durante un intervalo.",
    input_schema: {
      type: "object",
      properties: {
        asset: { type: "string", description: "Nombre del archivo de imagen" },
        start: { type: "number" },
        end: { type: "number" },
        position,
        size: { type: "number", description: "Ancho relativo al lienzo (0.05–1). 1 = pantalla completa" },
        animation,
      },
      required: ["asset", "start", "end"],
    },
  },
  {
    name: "add_text",
    description: "Añade un texto en pantalla (título, gancho, etiqueta, llamada a la acción).",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string" },
        start: { type: "number" },
        end: { type: "number" },
        position,
        preset: {
          type: "string",
          enum: ["titulo", "subtitulo", "etiqueta", "cta"],
          description: "titulo: grande con borde. subtitulo: mediano. etiqueta: caja de color. cta: botón redondeado.",
        },
        color: { type: "string", description: "Color hex (texto, o fondo de la caja en etiqueta/cta)" },
        size: { type: "number", description: "Multiplicador de tamaño (0.3–3). Por defecto 1" },
        animation,
      },
      required: ["text", "start", "end"],
    },
  },
  {
    name: "add_music",
    description:
      "Añade un archivo de audio subido por el usuario como música de fondo (se repite en bucle si es más corto).",
    input_schema: {
      type: "object",
      properties: {
        asset: { type: "string", description: "Nombre del archivo de audio" },
        start: { type: "number" },
        end: { type: "number", description: "Por defecto, el final del video" },
        volume: { type: "number", description: "0–2. Para música bajo la voz usa 0.15–0.3" },
        fade_in: { type: "number" },
        fade_out: { type: "number" },
      },
      required: ["asset"],
    },
  },
  {
    name: "add_sound_effect",
    description: "Añade un efecto de sonido integrado en un instante.",
    input_schema: {
      type: "object",
      properties: {
        effect: {
          type: "string",
          enum: ["whoosh", "pop", "ding", "boom", "click", "riser", "tada", "buzzer", "glitch", "bubble"],
        },
        at: { type: "number", description: "Segundo de la línea de tiempo" },
        volume: { type: "number", description: "0–2, por defecto 0.8" },
      },
      required: ["effect", "at"],
    },
  },
  {
    name: "add_effect",
    description:
      "Añade un efecto visual en un intervalo. Filtros: blanco_negro, sepia, vintage, desenfoque, brillo, contraste, saturacion, vineta. Movimiento: zoom (punch-in para enfatizar), temblor, glitch. Transiciones: fundido_entrada, fundido_salida, flash. Estilo: cine (barras negras).",
    input_schema: {
      type: "object",
      properties: {
        effect: {
          type: "string",
          enum: [
            "blanco_negro",
            "sepia",
            "vintage",
            "desenfoque",
            "brillo",
            "contraste",
            "saturacion",
            "vineta",
            "zoom",
            "temblor",
            "fundido_entrada",
            "fundido_salida",
            "flash",
            "glitch",
            "cine",
          ],
        },
        start: { type: "number" },
        end: { type: "number" },
        intensity: { type: "number", description: "0–1, por defecto 0.7" },
      },
      required: ["effect", "start", "end"],
    },
  },
  {
    name: "set_format",
    description:
      "Cambia la relación de aspecto del video final y cómo se encuadra. 9:16 para Reels/TikTok/Shorts, 16:9 YouTube, 1:1 o 4:5 para el feed de Instagram. fit: cover (recorta y llena), contain (bandas negras), blur (fondo desenfocado).",
    input_schema: {
      type: "object",
      properties: {
        aspect: { type: "string", enum: ["16:9", "9:16", "1:1", "4:5"] },
        fit: { type: "string", enum: ["cover", "contain", "blur"] },
      },
    },
  },
  {
    name: "set_video_volume",
    description: "Cambia el volumen del audio original de todos los clips de video (0 = silencio, 1 = normal, 2 = doble).",
    input_schema: {
      type: "object",
      properties: { volume: { type: "number" } },
      required: ["volume"],
    },
  },
  {
    name: "apply_brand",
    description:
      "Aplica el kit de marca del cliente al video: su tipografía y colores en textos y subtítulos, y (si tiene) su logo en una esquina durante todo el video. Úsalo cuando pidan 'pon mi marca', 'mi logo', 'mis colores', o al armar un video para su negocio.",
    input_schema: {
      type: "object",
      properties: {
        include_logo: { type: "boolean", description: "Poner el logo. Por defecto true." },
        logo_position: { type: "string", enum: ["top-left", "top-right", "bottom-left", "bottom-right"] },
      },
    },
  },
  {
    name: "clear",
    description: "Elimina todos los elementos de un tipo.",
    input_schema: {
      type: "object",
      properties: {
        what: {
          type: "string",
          enum: ["subtitles", "effects", "overlays", "texts", "images", "music", "sound_effects"],
        },
      },
      required: ["what"],
    },
  },
];

export const SYSTEM_PROMPT = `Eres el editor de video con IA de "Impulsa Studio", una web donde cualquier persona sube sus videos en crudo y describe con sus palabras lo que quiere. Tu trabajo es convertir esas peticiones en ediciones reales usando las herramientas disponibles.

Cómo trabajar:
- Cada mensaje del usuario incluye el estado actual del proyecto. Todos los tiempos de las herramientas son segundos de la línea de tiempo actual (no del archivo original).
- Haz las ediciones directamente; no pidas confirmación salvo que la petición sea realmente ambigua o falte un archivo necesario (por ejemplo, pide que suba la música o la foto si no está en "Medios subidos").
- Si una petición depende de lo que se dice en el video (cortar errores, poner algo "cuando hablo de X", elegir los mejores momentos), llama primero a get_transcript.
- Los cortes desplazan todo lo que viene después. Si vas a cortar y además colocar textos/efectos/sonidos, haz los cortes primero, luego pide de nuevo la transcripción si necesitas los tiempos nuevos, y después coloca el resto.
- Piensa como un editor de contenido para redes: ganchos en los primeros segundos, subtítulos legibles, zoom para enfatizar frases clave, efectos de sonido sutiles en transiciones, música de fondo baja (0.15–0.3) cuando hay voz.
- No abuses: pocos efectos bien colocados se ven mejor que muchos.
- Si hay un kit de marca en el estado del proyecto, úsalo: aplica la marca (apply_brand) cuando tenga sentido, usa sus datos reales de contacto, frases y tono en los textos y llamados a la acción. Nunca inventes precios, teléfonos ni promociones.
- Si en el estado aparecen "Referencias de estilo elegidas", imita ese estilo: mismo preset y colores de subtítulos, ritmo de cortes parecido (quita silencios y pausas si la referencia es rápida), textos de gancho y llamados a la acción del mismo tipo, y los efectos que describe. Adáptalo al contenido y a la marca del cliente; no copies textos literales de la referencia.
- Si piden el texto para publicar (descripción, caption, copy, hashtags), escríbelo directamente en tu respuesta con el tono de la marca: gancho, mensaje, llamado a la acción y hashtags. También pueden usar la pestaña "Publicar".
- Al terminar, responde en el idioma del usuario con un resumen breve y concreto de lo que hiciste (2–5 viñetas) y, si tiene sentido, una sugerencia de siguiente paso. No uses tablas.`;
