import { NextResponse, type NextRequest } from "next/server";
import { authenticate } from "./lib/auth";
import { errorResponse } from "./lib/errors";

export function middleware(request: NextRequest) {
  try {
    authenticate(request);
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
