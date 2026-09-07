import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError } from "./errors";

export function authenticate(request: Request): string {
  const username = process.env.GT_ACCESS_USERNAME || "coach";
  const password = process.env.GT_ACCESS_PASSWORD;
  if (!password || password.length < 32 || password.includes("...")) {
    throw new ApiError(503, "Private access is not configured. Contact the app owner.");
  }
  const header = request.headers.get("authorization") || "";
  const match = /^Basic ([A-Za-z0-9+/]+=*)$/i.exec(header);
  if (!match || header.length > 1024) throw new ApiError(401, "Sign in to use Gym Talk.");
  const supplied = Buffer.from(match[1], "base64").toString("utf8");
  const digest = (text: string) => createHash("sha256").update(text).digest();
  if (!timingSafeEqual(digest(supplied), digest(`${username}:${password}`))) {
    throw new ApiError(401, "The username or password is incorrect.");
  }
  return createHash("sha256").update(username).digest("hex").slice(0, 24);
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiError(403, "Requests must come from this app.");
  }
}
