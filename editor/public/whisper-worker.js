// Speech-to-text worker. Runs OpenAI Whisper fully in the browser via Transformers.js
// (the model is downloaded once from the Hugging Face Hub and cached by the browser).
import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";

let asr = null;
let loadedModel = null;

async function hasWebGPU() {
  try {
    return !!(navigator.gpu && (await navigator.gpu.requestAdapter()));
  } catch {
    return false;
  }
}

async function load(model, id) {
  if (asr && loadedModel === model) return asr;
  const progress_callback = (progress) => self.postMessage({ type: "progress", id, progress });
  if (await hasWebGPU()) {
    try {
      asr = await pipeline("automatic-speech-recognition", model, { device: "webgpu", progress_callback });
      loadedModel = model;
      return asr;
    } catch (e) {
      console.warn("WebGPU no disponible, usando WASM", e);
    }
  }
  asr = await pipeline("automatic-speech-recognition", model, { progress_callback });
  loadedModel = model;
  return asr;
}

self.onmessage = async (e) => {
  const { id, audio, language, model } = e.data;
  try {
    self.postMessage({ type: "status", id, status: "Cargando modelo de voz…" });
    const run = await load(model, id);
    self.postMessage({ type: "status", id, status: "Transcribiendo audio…" });
    const opts = { task: "transcribe", return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 };
    if (language) opts.language = language;
    const result = await run(audio, opts);
    self.postMessage({ type: "result", id, result });
  } catch (err) {
    self.postMessage({ type: "error", id, error: String((err && err.message) || err) });
  }
};
