// Speech-to-text worker. Runs OpenAI Whisper fully in the browser via Transformers.js
// (the model is downloaded once from the Hugging Face Hub and cached by the browser).
import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";

let asr = null;
let loadedModel = null;
let device = null;
// WebGPU on phones often loses the GPU device in the middle of a job: use WASM there
let forceWasm = /Android|iPhone|iPad|iPod|Mobile/i.test(self.navigator?.userAgent ?? "");

async function hasWebGPU() {
  try {
    return !!(navigator.gpu && (await navigator.gpu.requestAdapter()));
  } catch {
    return false;
  }
}

async function load(model, id) {
  if (asr && loadedModel === model) return asr;
  asr = null;
  const progress_callback = (progress) => self.postMessage({ type: "progress", id, progress });
  if (!forceWasm && (await hasWebGPU())) {
    try {
      asr = await pipeline("automatic-speech-recognition", model, { device: "webgpu", progress_callback });
      loadedModel = model;
      device = "webgpu";
      return asr;
    } catch (e) {
      console.warn("WebGPU no disponible, usando WASM", e);
      forceWasm = true;
    }
  }
  asr = await pipeline("automatic-speech-recognition", model, { device: "wasm", progress_callback });
  loadedModel = model;
  device = "wasm";
  return asr;
}

async function transcribe(audio, language, model, id) {
  const run = await load(model, id);
  self.postMessage({ type: "status", id, status: "Transcribiendo audio…" });
  const opts = { task: "transcribe", return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 };
  if (language) opts.language = language;
  return run(audio, opts);
}

self.onmessage = async (e) => {
  const { id, audio, language, model } = e.data;
  try {
    self.postMessage({ type: "status", id, status: "Cargando modelo de voz…" });
    let result;
    try {
      result = await transcribe(audio, language, model, id);
    } catch (err) {
      if (device !== "webgpu") throw err;
      // the GPU failed mid-way (e.g. "A valid external Instance reference no longer exists"): retry on WASM
      console.warn("WebGPU falló, reintentando con WASM", err);
      forceWasm = true;
      asr = null;
      loadedModel = null;
      self.postMessage({ type: "status", id, status: "Reintentando en modo compatible…" });
      result = await transcribe(audio, language, model, id);
    }
    self.postMessage({ type: "result", id, result });
  } catch (err) {
    self.postMessage({ type: "error", id, error: String((err && err.message) || err) });
  }
};
