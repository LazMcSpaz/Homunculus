// Shared server-side helpers for calling the Anthropic API from route handlers.
// Not a route (filename isn't `route.ts`), so it is never exposed as an endpoint.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/** Claude Haiku 4.5 — fast, cheap structured output (AI Layer design doc). */
export const HAIKU = 'claude-haiku-4-5-20251001';

/** Resolve the API key from the Cloudflare Worker env, falling back to process.env (local dev). */
export async function getApiKey(): Promise<string | undefined> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { env } = getCloudflareContext();
    if (env?.ANTHROPIC_API_KEY) return env.ANTHROPIC_API_KEY;
  } catch {
    // Not running on the Cloudflare runtime (e.g. plain `next dev`).
  }
  return process.env.ANTHROPIC_API_KEY;
}

interface SystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export interface AnthropicCallResult {
  ok: boolean;
  status: number;
  /** Concatenated text content when ok; error detail otherwise. */
  text: string;
}

/** Make a single Messages API call and return the concatenated text content. */
export async function callAnthropic(
  apiKey: string,
  opts: { system: SystemBlock[]; userContent: string; maxTokens?: number },
): Promise<AnthropicCallResult> {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: HAIKU,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: [{ role: 'user', content: opts.userContent }],
    }),
  });

  if (!res.ok) {
    return { ok: false, status: res.status, text: (await res.text()).slice(0, 500) };
  }

  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (data.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
  return { ok: true, status: 200, text };
}

/** Extract a JSON value from a model response that may be fenced or prose-wrapped. */
export function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  // Find the outermost object or array.
  const firstObj = candidate.indexOf('{');
  const firstArr = candidate.indexOf('[');
  let start = -1;
  let openCh = '{';
  let closeCh = '}';
  if (firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)) {
    start = firstArr;
    openCh = '[';
    closeCh = ']';
  } else {
    start = firstObj;
  }
  if (start === -1) throw new Error('No JSON in model response');
  const end = candidate.lastIndexOf(closeCh);
  if (end === -1) throw new Error('Unterminated JSON in model response');
  return JSON.parse(candidate.slice(start, end + 1));
}
