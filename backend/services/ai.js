// Shared Gemini access: one client, one retry policy, one JSON contract.
//
// Why this file exists:
//  - gemini-3.6-flash intermittently returns 503 "high demand" (verified: a call
//    that 503s succeeds moments later with no change), so every AI call retries.
//  - Untrusted model output is validated here, BEFORE it reaches a route. The
//    previous code JSON.parsed and saved whatever came back, which is why every
//    job in the live DB holds an empty analysis shell and looks "successful".

const { GoogleGenAI } = require('@google/genai');

const MODEL = 'gemini-3.6-flash';

let client = null;
function getClient() {
  if (!client) {
    if (!process.env.GEMINI_API_KEY) {
      throw new AiError('GEMINI_API_KEY is not set on the server', 500, 'NO_API_KEY');
    }
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

class AiError extends Error {
  constructor(message, status = 502, code = 'AI_ERROR') {
    super(message);
    this.name = 'AiError';
    this.status = status;
    this.code = code;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry only what's worth retrying. A 400 (bad prompt/schema) or a JSON parse
// failure is deterministic — retrying just burns quota and doubles user latency.
function isRetryable(err) {
  const code = err?.status ?? err?.code;
  if (code === 400 || code === 401 || code === 403 || code === 404) return false;
  if (code === 429 || code === 500 || code === 502 || code === 503 || code === 504) return true;
  const msg = String(err?.message || '');
  return /high demand|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|429|503/i.test(msg);
}

async function withRetry(fn, { attempts = 4, baseMs = 2000 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || i === attempts - 1) break;
      // Exponential backoff with jitter: 2s, 4s, 8s (+/-25%)
      const wait = baseMs * 2 ** i * (0.75 + Math.random() * 0.5);
      await sleep(wait);
    }
  }
  const code = lastErr?.status ?? lastErr?.code;
  const transient = isRetryable(lastErr);
  throw new AiError(
    transient
      ? `The AI service is temporarily unavailable (${code || 'network error'}). Please try again.`
      : lastErr?.message || 'AI request failed',
    transient ? 503 : 502,
    transient ? 'AI_UNAVAILABLE' : 'AI_ERROR'
  );
}

// Pull a JSON object out of a model response, tolerating stray prose or fences.
function safeJson(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new AiError('The AI returned an empty response', 502, 'AI_EMPTY');
  }
  const cleaned = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const slice = start !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  try {
    return JSON.parse(slice);
  } catch {
    throw new AiError(
      `The AI returned malformed JSON: ${slice.slice(0, 300)}`,
      502,
      'AI_BAD_JSON'
    );
  }
}

/**
 * Call Gemini and return parsed JSON.
 *
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {object} opts.schema      responseSchema — keep it loose, only truly
 *                                 required fields; the caller's normalizer is
 *                                 the real source of truth, not the schema.
 * @param {number} [opts.thinkingLevel] 'low' for bulk work (cheaper/faster).
 * @param {number} [opts.maxOutputTokens]
 * @param {() => boolean} [opts.validate] throws to reject an unusable response.
 */
async function generateJson({ prompt, schema, thinkingLevel, maxOutputTokens, validate }) {
  const config = { responseMimeType: 'application/json' };
  if (schema) config.responseSchema = schema;
  if (thinkingLevel) config.thinkingConfig = { thinkingLevel };
  if (maxOutputTokens) config.maxOutputTokens = maxOutputTokens;

  const raw = await withRetry(async () => {
    const res = await getClient().models.generateContent({
      model: MODEL,
      contents: prompt,
      config,
    });
    return res?.text;
  });

  const parsed = safeJson(raw);
  if (validate) validate(parsed); // validation failure is deterministic: no retry
  return parsed;
}

module.exports = { generateJson, withRetry, safeJson, AiError, MODEL };
