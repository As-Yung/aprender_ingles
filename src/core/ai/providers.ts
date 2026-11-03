/**
 * AI providers the learner can connect with their OWN API key.
 *
 * Security model (see SECURITY.md → "AI tutor"):
 * - The key lives only in memory (see store.ts). It is never written to localStorage,
 *   sessionStorage, cookies, Supabase or our servers.
 * - Requests go straight from the browser to the provider over HTTPS (CSP allows only
 *   these three hosts in connect-src). Our backend never sees the key or the questions.
 * - Answers are rendered as plain text (no HTML), so a model reply cannot inject markup.
 */
export type ProviderId = 'claude' | 'chatgpt' | 'gemini';

export interface ModelOption {
  id: string;
  label: string;
}

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  company: string;
  icon: string;
  /** Where the learner creates an API key. */
  keyUrl: string;
  /** Typical key prefix, used only for a friendly warning. */
  keyPrefix: string;
  models: ModelOption[];
  defaultModel: string;
  /** Opens the provider's normal chat (uses the learner's own subscription, no key). */
  chatUrl: (prompt: string) => string;
  /** Whether chatUrl pre-fills the prompt (otherwise the learner pastes it). */
  prefills: boolean;
}

const MAX_URL_PROMPT = 6000;
const q = (base: string, prompt: string) =>
  prompt.length <= MAX_URL_PROMPT ? `${base}?q=${encodeURIComponent(prompt)}` : base;

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  claude: {
    id: 'claude',
    name: 'Claude',
    company: 'Anthropic',
    icon: '✳️',
    keyUrl: 'https://platform.claude.com/settings/keys',
    keyPrefix: 'sk-ant-',
    models: [
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (smartest)' },
      { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (balanced)' },
      { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (fastest, cheapest)' },
    ],
    defaultModel: 'claude-opus-5-5',
    chatUrl: (p) => q('https://claude.ai/new', p),
    prefills: true,
  },
  chatgpt: {
    id: 'chatgpt',
    name: 'ChatGPT',
    company: 'OpenAI',
    icon: '🟢',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPrefix: 'sk-',
    models: [
      { id: 'gpt-5-mini', label: 'GPT-5 mini (fast, cheap)' },
      { id: 'gpt-5', label: 'GPT-5 (smartest)' },
    ],
    defaultModel: 'gpt-5-mini',
    chatUrl: (p) => q('https://chatgpt.com/', p),
    prefills: true,
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    company: 'Google',
    icon: '🔷',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyPrefix: 'AIza',
    models: [
      { id: 'gemini-flash-latest', label: 'Gemini Flash (fast, free tier)' },
      { id: 'gemini-pro-latest', label: 'Gemini Pro (smartest)' },
    ],
    defaultModel: 'gemini-flash-latest',
    chatUrl: () => 'https://gemini.google.com/app',
    prefills: false,
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface HttpRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

const MAX_OUTPUT_TOKENS = 4000;

/** Model ids go into a URL path for Gemini: allow only safe characters. */
export function isSafeModelId(model: string): boolean {
  return /^[a-z0-9][a-z0-9.\-_]{1,63}$/i.test(model);
}

export function keyLooksValid(provider: ProviderId, key: string): boolean {
  const k = key.trim();
  return k.length >= 20 && k.length <= 300 && !/\s/.test(k) && k.startsWith(PROVIDERS[provider].keyPrefix);
}

/** Builds the streaming HTTP request for a provider. Pure function (easy to test). */
export function buildRequest(
  provider: ProviderId,
  apiKey: string,
  model: string,
  system: string,
  turns: ChatTurn[],
  maxTokens = MAX_OUTPUT_TOKENS,
): HttpRequest {
  if (!isSafeModelId(model)) throw new Error('Invalid model name.');
  const key = apiKey.trim();
  switch (provider) {
    case 'claude': {
      // Server-side refusal fallback is offered on Opus/Sonnet 5.5, not on Haiku.
      const fallback = !model.startsWith('claude-haiku');
      return {
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          // Required by Anthropic for calls made directly from a browser (BYO key).
          'anthropic-dangerous-direct-browser-access': 'true',
          ...(fallback ? { 'anthropic-beta': 'server-side-fallback-2026-07-01' } : {}),
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system,
          stream: true,
          // A tutor chat: short, quick answers.
          output_config: { effort: 'low' },
          ...(fallback ? { fallbacks: 'default' } : {}),
          messages: turns.map((t) => ({ role: t.role, content: t.text })),
        }),
      };
    }
    case 'chatgpt':
      return {
        url: 'https://api.openai.com/v1/chat/completions',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          stream: true,
          max_completion_tokens: maxTokens,
          messages: [{ role: 'system', content: system }, ...turns.map((t) => ({ role: t.role, content: t.text }))],
        }),
      };
    case 'gemini':
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: turns.map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.text }] })),
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      };
  }
}

export interface StreamPiece {
  text?: string;
  error?: string;
  refused?: boolean;
}

/** Reads one parsed SSE JSON event and returns the text it adds (if any). */
export function parseEvent(provider: ProviderId, data: unknown): StreamPiece {
  if (!data || typeof data !== 'object') return {};
  const d = data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (d.error) return { error: String(d.error.message ?? d.error) };
  switch (provider) {
    case 'claude':
      if (d.type === 'content_block_delta' && d.delta?.type === 'text_delta') return { text: String(d.delta.text ?? '') };
      if (d.type === 'message_delta' && d.delta?.stop_reason === 'refusal') return { refused: true };
      return {};
    case 'chatgpt': {
      const c = d.choices?.[0]?.delta?.content;
      return typeof c === 'string' ? { text: c } : {};
    }
    case 'gemini': {
      const parts = d.candidates?.[0]?.content?.parts;
      if (!Array.isArray(parts)) return {};
      return { text: parts.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('') };
    }
  }
}

/** Splits an SSE buffer into complete `data:` payloads; returns the leftover partial chunk. */
export function splitSse(buffer: string): { events: string[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const blocks = normalized.split('\n\n');
  const rest = blocks.pop() ?? '';
  const events: string[] = [];
  for (const block of blocks) {
    const data = block
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart())
      .join('\n');
    if (data && data !== '[DONE]') events.push(data);
  }
  return { events, rest };
}

/** Friendly English error for an HTTP failure (never echoes the key). */
export function httpErrorMessage(status: number, providerMessage: string, key: string): string {
  const clean = providerMessage.split(key.trim()).join('•••').slice(0, 300);
  if (status === 401 || status === 403) return 'Your API key was rejected. Check that you copied it completely and that it is active.';
  if (status === 404) return 'That model is not available for your key. Try another model.';
  if (status === 429) return 'Too many requests or no credit left on your AI account. Wait a moment or check your billing.';
  if (status >= 500) return 'The AI service is having problems right now. Try again in a minute.';
  return clean || `Request failed (HTTP ${status}).`;
}

export interface StreamOptions {
  provider: ProviderId;
  apiKey: string;
  model: string;
  system: string;
  turns: ChatTurn[];
  signal?: AbortSignal;
  maxTokens?: number;
  onText: (chunk: string) => void;
}

/** Sends the question and streams the answer back, chunk by chunk. */
export async function streamChat(opts: StreamOptions): Promise<{ refused: boolean }> {
  const req = buildRequest(opts.provider, opts.apiKey, opts.model, opts.system, opts.turns, opts.maxTokens);
  const res = await fetch(req.url, {
    method: 'POST',
    headers: req.headers,
    body: req.body,
    signal: opts.signal,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
  });
  if (!res.ok || !res.body) {
    let msg = '';
    try {
      const j = (await res.json()) as { error?: { message?: string } | string } | Array<{ error?: { message?: string } }>;
      const e = Array.isArray(j) ? j[0]?.error : j.error;
      msg = typeof e === 'string' ? e : (e?.message ?? '');
    } catch {
      /* not JSON */
    }
    throw new Error(httpErrorMessage(res.status, msg, opts.apiKey));
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let refused = false;
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const { events, rest } = splitSse(done ? `${buffer}\n\n` : buffer);
    buffer = rest;
    for (const raw of events) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      const piece = parseEvent(opts.provider, parsed);
      if (piece.error) throw new Error(piece.error.split(opts.apiKey.trim()).join('•••').slice(0, 300));
      if (piece.refused) refused = true;
      if (piece.text) opts.onText(piece.text);
    }
    if (done) break;
  }
  return { refused };
}
