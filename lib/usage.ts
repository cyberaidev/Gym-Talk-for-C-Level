import { randomUUID } from "node:crypto";
import { ApiError } from "./errors";
import { LIMITS } from "./limits";

// All checks and reservations run atomically across every production instance.
export const ACQUIRE_SCRIPT = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - 60000)
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', now)
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[2]) then return 60 end
if tonumber(redis.call('GET', KEYS[2]) or '0') >= tonumber(ARGV[3]) then return math.max(1, redis.call('TTL', KEYS[2])) end
if redis.call('ZCARD', KEYS[3]) >= tonumber(ARGV[4]) then return 5 end
redis.call('ZADD', KEYS[1], now, ARGV[1])
redis.call('PEXPIRE', KEYS[1], 60000)
if redis.call('INCR', KEYS[2]) == 1 then redis.call('EXPIRE', KEYS[2], 86400) end
redis.call('ZADD', KEYS[3], now + 70000, ARGV[1])
redis.call('PEXPIRE', KEYS[3], 70000)
return 0`;

type Bucket = { minute: number[]; dayStarted: number; daily: number; active: Map<string, number> };
const local = new Map<string, Bucket>();

export async function acquireUsage(principal: string): Promise<() => Promise<void>> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const id = randomUUID();
  if (url && token) {
    if (!url.startsWith("https://")) throw new ApiError(503, "Usage protection is not configured correctly.");
    const command = async (args: (string | number)[]): Promise<unknown> => {
      try {
        const response = await fetch(url, {
          method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(args), signal: AbortSignal.timeout(3000), cache: "no-store"
        });
        const payload = await response.json();
        if (!response.ok || payload.error || !("result" in payload)) throw new Error("Redis request failed");
        return payload.result;
      } catch {
        throw new ApiError(503, "Usage protection is temporarily unavailable. Please try again.");
      }
    };
    const prefix = `gym-talk:{${principal}}`;
    const retry = await command(["EVAL", ACQUIRE_SCRIPT, 3, `${prefix}:minute`, `${prefix}:day`, `${prefix}:active`,
      id, LIMITS.requestsPerMinute, LIMITS.requestsPerDay, LIMITS.concurrentRequests]);
    if (typeof retry !== "number" || retry < 0) throw new ApiError(503, "Usage protection is unavailable.");
    if (retry > 0) throw new ApiError(429, "Practice usage limit reached. Please try again later.", retry);
    return async () => {
      try { await command(["ZREM", `${prefix}:active`, id]); } catch { /* The reservation expires after 70 seconds. */ }
    };
  }
  if (process.env.NODE_ENV === "production" || url || token) {
    throw new ApiError(503, "Shared usage protection is not configured. Contact the app owner.");
  }
  // Development only. Production fails closed unless the shared store is available.
  const now = Date.now();
  const bucket = local.get(principal) || { minute: [], dayStarted: now, daily: 0, active: new Map() };
  bucket.minute = bucket.minute.filter(time => time > now - 60_000);
  for (const [key, expires] of bucket.active) if (expires <= now) bucket.active.delete(key);
  if (now - bucket.dayStarted >= 86_400_000) { bucket.dayStarted = now; bucket.daily = 0; }
  local.set(principal, bucket);
  const retry = bucket.daily >= LIMITS.requestsPerDay ? Math.ceil((86_400_000 - now + bucket.dayStarted) / 1000)
    : bucket.minute.length >= LIMITS.requestsPerMinute ? 60 : bucket.active.size >= LIMITS.concurrentRequests ? 5 : 0;
  if (retry) throw new ApiError(429, "Practice usage limit reached. Please try again later.", retry);
  bucket.minute.push(now); bucket.daily++; bucket.active.set(id, now + 70_000);
  return async () => { bucket.active.delete(id); };
}
