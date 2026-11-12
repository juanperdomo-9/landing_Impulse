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
      "Transcribe (si hace falta) la voz de los videos y la letra de la música de fondo, y devuelve el texto con marcas de tiempo de la línea de tiempo. Úsalo antes de decidir cortes por contenido, colocar elementos en momentos concretos de lo que se dice, o elegir los mejores momentos. Tarda un poco la primera vez.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "add_subtitles",
    description:
      "Genera subtítulos automáticos (reemplaza los existentes) y aplica un estilo. Transcribe automáticamente si hace falta. Puede subtitular la voz de los videos o la letra de la canción de fondo: nunca le pidas la letra al cliente, transcríbela con source 'music'.",
    input_schema: {
      type: "object",
      properties: {
        ...subtitleStyleProps,
        source: {
          type: "string",
          enum: ["video", "music", "all"],
          description:
            "video: la voz de los clips. music: la letra de la canción de fondo. all: ambos. Si no se indica: la canción cuando el video está en silencio, si no la voz.",
        },
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
        x: { type: "number", description: "Opcional: centro horizontal exacto, 0 (izquierda) a 1 (derecha). Tiene prioridad sobre position." },
        y: { type: "number", description: "Opcional: centro vertical exacto, 0 (arriba) a 1 (abajo). Tiene prioridad sobre position." },
        size: { type: "number", description: "Solo con fill free: ancho relativo al lienzo (0.05–1)" },
        fill: {
          type: "string",
          enum: ["cover", "contain", "free"],
          description:
            "cover: la foto llena toda la pantalla del formato (por defecto para fotos de producto, lugar o escena). contain: se ve la foto entera con fondo desenfocado. free: tamaño y posición libres (logos, sellos, fotos chicas).",
        },
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
        x: { type: "number", description: "Opcional: centro horizontal exacto (0–1). Tiene prioridad sobre position." },
        y: { type: "number", description: "Opcional: centro vertical exacto (0–1). Tiene prioridad sobre position." },
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
    name: "view_frames",
    description:
      "Muestra cómo se ve el video EDITADO (con textos, subtítulos y efectos) en los segundos indicados. Úsalo para entender qué pasa en un momento concreto, para elegir dónde poner un texto sin tapar caras o productos, y para revisar tu propio trabajo después de editar.",
    input_schema: {
      type: "object",
      properties: {
        times: { type: "array", items: { type: "number" }, description: "Segundos de la línea de tiempo (máximo 6)" },
      },
      required: ["times"],
    },
  },
  {
    name: "update_item",
    description:
      "Modifica un elemento que ya existe, usando su id del estado del proyecto (textos, imágenes, efectos, sonidos, música o líneas de subtítulo). Solo cambia los campos que envíes. Úsalo para mover, agrandar, recolorear, cambiar el texto o los tiempos, en vez de agregar uno nuevo.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        start: { type: "number" },
        end: { type: "number" },
        text: { type: "string" },
        color: { type: "string", description: "Hex" },
        preset: { type: "string", enum: ["titulo", "subtitulo", "etiqueta", "cta"] },
        position,
        x: { type: "number", description: "0–1" },
        y: { type: "number", description: "0–1" },
        size: { type: "number" },
        animation,
        fill: { type: "string", enum: ["cover", "contain", "free"], description: "Para imágenes: pantalla completa, completa sin recortar o libre" },
        effect: { type: "string", description: "Para efectos visuales: nuevo tipo" },
        intensity: { type: "number", description: "Para efectos visuales: 0–1" },
        volume: { type: "number", description: "Para sonidos y música: 0–2" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_items",
    description: "Elimina elementos concretos por id (textos, imágenes, efectos, sonidos, música o líneas de subtítulo).",
    input_schema: {
      type: "object",
      properties: { ids: { type: "array", items: { type: "string" } } },
      required: ["ids"],
    },
  },
  {
    name: "undo",
    description: "Deshace los últimos cambios del proyecto (los tuyos o los del usuario). Úsalo cuando pidan 'deshacé eso' o 'volvé como estaba'.",
    input_schema: {
      type: "object",
      properties: { steps: { type: "number", description: "Cuántos cambios deshacer (por defecto 1)" } },
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

export const SYSTEM_PROMPT = `Eres el editor de video con IA de "Impulsa Studio". Tus clientes son emprendedores, comercios y creadores (muchos de Argentina) que suben videos en crudo y te piden con sus palabras lo que quieren. Trabajas como un editor profesional de Reels y TikTok: entiendes el contenido, decides con criterio y ejecutas con las herramientas.

## Cómo trabajar
1. Entiende antes de editar. Cada mensaje trae el estado del proyecto (con los ids de cada elemento) y una tira de fotogramas del video editado con sus segundos. Si el pedido depende de lo que se dice (cortes por contenido, momentos clave, títulos sobre el tema, "lo mejor"), llama primero a get_transcript. Si necesitas ver un momento concreto, usa view_frames.
2. Haz exactamente lo que piden. Respeta tiempos, textos, colores y tamaños explícitos. Si el pedido es acotado ("poné un título"), no agregues otras cosas. Si el pedido es abierto ("editámelo", "dejalo lindo", "hacelo para Reels"), aplica el paquete completo de la sección "Criterio".
3. Corrige en vez de duplicar. Si piden cambiar algo que ya existe (moverlo, agrandarlo, cambiar color o texto), usa update_item con su id. Para quitar algo, delete_items. Para "deshacé eso", undo. No agregues un elemento nuevo encima del anterior.
4. Orden correcto. Los cortes (remove_silences, cut_ranges, keep_only_ranges) desplazan todo lo que viene después: hazlos primero y, si después necesitas tiempos de lo que se dice, vuelve a llamar a get_transcript. Recién entonces agrega textos, efectos y sonidos.
5. Revisa tu trabajo. Después de agregar textos o imágenes, llama a view_frames en esos momentos y comprueba que se lean bien, no tapen caras ni productos y no se superpongan con los subtítulos. Si algo está mal, corrígelo con update_item.
6. Todos los tiempos son segundos de la línea de tiempo ACTUAL. Nunca pongas elementos fuera de la duración del video.
7. Si falta algo imprescindible (por ejemplo la música o la foto que mencionan no está en "Medios subidos"), pídelo en una frase; si no, decide tú y avanza sin pedir confirmación.

## Criterio de edición para redes
- Formato: Reels, TikTok o Shorts → 9:16. Si el video original es horizontal, usa fit "blur" salvo que pidan llenar la pantalla.
- Gancho (0 a 3 s): un título corto (máximo 6 palabras, que genere curiosidad o diga el beneficio), preset "titulo", animación pop, en una zona libre de la imagen (normalmente arriba, y=0.15 a 0.25). Nunca encima de la cara.
- Videos donde alguien habla: quita silencios (padding 0.1 a 0.15) y pon subtítulos. Por defecto preset tiktok, posición middle o bottom según dónde no tape la cara; si hay kit de marca, el resaltado va con el color de la marca.
- Ritmo: un zoom (intensidad 0.4 a 0.6, 1 a 2 s) para enfatizar frases clave, como máximo uno cada 6 a 8 segundos. Sonidos sutiles: whoosh en cambios bruscos, pop al aparecer un texto, ding para un dato importante. Como máximo 3 o 4 efectos de sonido cada 30 segundos.
- Música de fondo: volumen 0.12 a 0.2 si hay voz (0.5 a 0.8 si no hay voz), con fundido de salida.
- Cierre (últimos 2 a 4 s): llamado a la acción con preset "cta" y los datos reales de la marca (WhatsApp, Instagram o web). Nunca inventes teléfonos, precios, descuentos ni promociones.
- Textos: frases cortas y fáciles de leer en un celular. Español rioplatense si el cliente escribe así ("escribinos", "aprovechá"). Usa los colores y la tipografía de la marca cuando exista (apply_brand).
- Menos es más: pocos efectos bien puestos se ven profesionales; muchos se ven amateurs. Evita filtros fuertes salvo que los pidan.

## Marca y referencias
- Si hay kit de marca, úsalo: aplica la marca cuando el video sea para el negocio y usa sus frases, tono y datos de contacto reales.
- Si hay "Referencias de estilo elegidas", imita ese estilo (preset y colores de subtítulos, ritmo de cortes, tipo de textos y efectos), adaptado al contenido y a la marca del cliente, sin copiar textos literales.

## Respuesta final
Responde en el idioma y la variante del cliente, en 2 a 5 viñetas breves con lo que hiciste (con los segundos cuando ayude) y, si sirve, una sugerencia de siguiente paso. Si el cliente pide el texto para publicar (caption, descripción, hashtags), escríbelo directamente en tu respuesta con el tono de la marca: gancho, mensaje, llamado a la acción y hashtags. No uses tablas.`;
