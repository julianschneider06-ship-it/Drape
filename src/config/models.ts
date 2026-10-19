// Single place for AI model IDs. Override any of them with an environment variable.
// IDs confirmed against the Gemini models list (v1beta) on 2026-10-19.
export const MODELS = {
  // Cheap multimodal model for image classification.
  classifier: process.env.DRAPE_MODEL_CLASSIFIER ?? "gemini-3.5-flash-lite",
  // Multimodal embedding model (default 3072 dims; supports outputDimensionality).
  embedding: process.env.DRAPE_MODEL_EMBEDDING ?? "gemini-embedding-2",
} as const;

export const GEMINI_API_BASE =
  process.env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com/v1beta";
