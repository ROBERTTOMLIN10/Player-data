/**
 * Sidearm Sports (fausports.com) renders schedule/box score pages with Nuxt,
 * server-rendering the page's full data store into a <script id="__NUXT_DATA__">
 * tag using Vue's "devalue" serialization format: a flat JSON array of cells,
 * where object/array values reference other cells by integer index instead of
 * nesting directly. This lets us read the exact same data the page's Vue
 * components render from, without needing a headless browser or reverse-
 * engineering an internal API endpoint (which Sidearm doesn't expose publicly).
 *
 * This is more resilient to markup/CSS changes than scraping rendered HTML:
 * as long as Sidearm keeps using Nuxt with this payload shape, field names
 * stay stable even if the visual layout is redesigned.
 */

const NUXT_DATA_PATTERN = /<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)<\/script>/s;

export class NuxtPayloadError extends Error {}

/** Extracts and resolves the __NUXT_DATA__ payload embedded in a Sidearm page's HTML. */
export function parseNuxtPayload(html: string): unknown {
  const match = html.match(NUXT_DATA_PATTERN);
  if (!match) {
    throw new NuxtPayloadError("__NUXT_DATA__ script tag not found in page HTML");
  }
  let cells: unknown[];
  try {
    cells = JSON.parse(match[1]);
  } catch (err) {
    throw new NuxtPayloadError(`__NUXT_DATA__ contents were not valid JSON: ${(err as Error).message}`);
  }
  if (!Array.isArray(cells)) {
    throw new NuxtPayloadError("__NUXT_DATA__ payload was not an array of cells");
  }
  return resolveCell(cells, 0, new Map());
}

const REACTIVE_WRAPPERS = new Set(["Reactive", "ShallowReactive", "Ref", "ShallowRef"]);

function resolveCell(cells: unknown[], index: number, memo: Map<number, unknown>): unknown {
  if (memo.has(index)) return memo.get(index);
  if (index < 0 || index >= cells.length) return undefined;
  memo.set(index, undefined); // cycle guard: self-references resolve to undefined, not infinite recursion
  const resolved = resolveValue(cells[index], cells, memo);
  memo.set(index, resolved);
  return resolved;
}

function resolveValue(value: unknown, cells: unknown[], memo: Map<number, unknown>): unknown {
  if (Array.isArray(value)) {
    if (value.length === 2 && typeof value[0] === "string" && REACTIVE_WRAPPERS.has(value[0])) {
      return resolveCell(cells, value[1] as number, memo);
    }
    if (value.length >= 1 && value[0] === "Set") {
      return new Set(value.slice(1).map((i) => resolveCell(cells, i as number, memo)));
    }
    if (value.length >= 1 && value[0] === "Map") {
      const m = new Map<unknown, unknown>();
      for (let i = 1; i + 1 < value.length; i += 2) {
        m.set(resolveCell(cells, value[i] as number, memo), resolveCell(cells, value[i + 1] as number, memo));
      }
      return m;
    }
    return value.map((v) => (typeof v === "number" ? resolveCell(cells, v, memo) : v));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = typeof v === "number" ? resolveCell(cells, v, memo) : v;
    }
    return out;
  }
  return value;
}

export async function fetchAndParseNuxtPage(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; FAU-MSOC-dashboard/1.0; internal team tool)",
    },
  });
  if (!res.ok) {
    throw new NuxtPayloadError(`fetch ${url} returned HTTP ${res.status}`);
  }
  const html = await res.text();
  return parseNuxtPayload(html);
}
