export class ApiError extends Error {
  constructor(public status: number, message: string, public retryAfter?: number) {
    super(message);
  }
}

export function errorResponse(error: unknown): Response {
  const known = error instanceof ApiError;
  const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
  const status = known ? error.status : timeout ? 504 : 502;
  const message = known ? error.message : timeout
    ? "The request timed out. Please try again."
    : "The service is temporarily unavailable. Please try again.";
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (status === 401) headers.set("WWW-Authenticate", 'Basic realm="Gym Talk", charset="UTF-8"');
  if (known && error.retryAfter) headers.set("Retry-After", String(error.retryAfter));
  return Response.json({ error: message }, { status, headers });
}

export function requireProvider(value: string | undefined): string {
  if (!value || value.includes("...")) throw new ApiError(503, "The coaching service is not configured. Contact the app owner.");
  return value;
}

export function checkProvider(response: Response): void {
  if (response.ok) return;
  if (response.status === 429) throw new ApiError(429, "The speech service is busy. Please try again shortly.", 30);
  throw new ApiError(502, "The speech service is unavailable. Please try again.");
}
