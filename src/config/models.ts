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

// Cheaper model used for quality/cost comparison (override with DRAPE_MODEL_CLASSIFIER_CHEAP).
export const CHEAP_CLASSIFIER = process.env.DRAPE_MODEL_CLASSIFIER_CHEAP ?? "gemini-3.1-flash-lite"; // gemini-2.5-flash-lite is listed but closed to new users

// Paid-tier standard list prices, USD per 1M tokens (ai.google.dev/gemini-api/docs/pricing, checked 2026-10-19).
export const PRICES: Record<string, { in: number; out: number }> = {
  "gemini-3.5-flash-lite": { in: 0.3, out: 2.5 },
  "gemini-3.1-flash-lite": { in: 0.25, out: 1.5 },
  "gemini-2.5-flash-lite": { in: 0.1, out: 0.4 },
};
export const EMBEDDING_IMAGE_PRICE_PER_M = 0.45;

// A product is feed-ready only if its chosen image is good enough (see docs/architecture.md).
export const FEED_READY_MIN_SUITABILITY = Number(process.env.DRAPE_FEED_READY_MIN ?? 0.7);
// Below this the job retries once with the runner-up image.
export const RETRY_BELOW_SUITABILITY = 0.5;
