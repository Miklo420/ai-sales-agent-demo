// Server-side helpers for /api/chat. Only imported from route handlers.

/* ------------------------------------------------------------------ */
/* Rate limiting — in-memory sliding window per IP                     */
/* ------------------------------------------------------------------ */
// Best-effort: state lives in the function instance. Fluid Compute reuses
// instances, so this stops casual abuse; a distributed store (e.g. Upstash
// Redis) would be needed for a hard, global guarantee.

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
export const RATE_LIMITS = { perMinute: 15, perHour: 40 } as const;
const MAX_TRACKED_IPS = 10_000;

const hits = new Map<string, number[]>();
let lastSweep = 0;

/** Drops IPs with no activity in the last hour (runs at most once a minute). */
function sweepExpired(now: number) {
  if (now - lastSweep < MINUTE_MS) return;
  lastSweep = now;
  for (const [ip, timestamps] of hits) {
    if ((timestamps.at(-1) ?? 0) <= now - HOUR_MS) hits.delete(ip);
  }
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; scope: "minute" | "hour"; retryAfterSec: number };

export function checkRateLimit(ip: string, now = Date.now()): RateLimitResult {
  sweepExpired(now);

  const recent = (hits.get(ip) ?? []).filter((t) => t > now - HOUR_MS);
  const lastMinute = recent.filter((t) => t > now - MINUTE_MS);

  if (lastMinute.length >= RATE_LIMITS.perMinute) {
    return { ok: false, scope: "minute", retryAfterSec: Math.ceil((lastMinute[0] + MINUTE_MS - now) / 1000) };
  }
  if (recent.length >= RATE_LIMITS.perHour) {
    return { ok: false, scope: "hour", retryAfterSec: Math.ceil((recent[0] + HOUR_MS - now) / 1000) };
  }

  recent.push(now);
  // Re-insert so Map order tracks recency; evict the stalest IP if the table is full.
  hits.delete(ip);
  if (hits.size >= MAX_TRACKED_IPS) {
    const stalest = hits.keys().next().value;
    if (stalest !== undefined) hits.delete(stalest);
  }
  hits.set(ip, recent);
  return { ok: true };
}

/** Client IP. On Vercel, x-forwarded-for is set by the edge and can't be spoofed. */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
}

/* ------------------------------------------------------------------ */
/* Origin check                                                        */
/* ------------------------------------------------------------------ */

function hostOf(value: string): string | null {
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * In production, only browser requests from this deployment's own domain(s)
 * — or from ALLOWED_ORIGINS (comma-separated) — may call the API.
 * Note: non-browser clients can forge Origin; this blocks cross-site use of
 * the endpoint from other websites, while the rate limit caps everything else.
 */
export function isAllowedOrigin(req: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true;

  const origin = req.headers.get("origin");
  const originHost = origin ? hostOf(origin) : null;
  if (!originHost) return false;

  const allowed = new Set<string>();
  const requestHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  for (const candidate of [
    requestHost,
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    ...(process.env.ALLOWED_ORIGINS ?? "").split(","),
  ]) {
    const host = candidate?.trim() ? hostOf(candidate.trim()) : null;
    if (host) allowed.add(host);
  }

  return allowed.has(originHost);
}

/* ------------------------------------------------------------------ */
/* Responses                                                           */
/* ------------------------------------------------------------------ */

/** Plain-text error: useChat shows the response body as the error message. */
export function textError(status: number, message: string, headers?: Record<string, string>): Response {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

/** Removes control characters/newlines so client-provided strings can't restructure the prompt. */
export function sanitizeForPrompt(value: string, maxLength = 120): string {
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, maxLength);
}
