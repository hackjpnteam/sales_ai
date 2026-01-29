import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const { auth } = NextAuth(authConfig);

// セキュリティヘッダーを追加
function addSecurityHeaders(response: NextResponse): NextResponse {
  // XSS対策
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-XSS-Protection", "1; mode=block");

  // クリックジャッキング対策
  response.headers.set("X-Frame-Options", "DENY");

  // Referrer情報の制限
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // HTTPS強制（本番環境）
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  // Content Security Policy
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://www.googletagmanager.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.openai.com https://api.stripe.com https://*.vercel.app wss:",
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
      "frame-ancestors 'none'",
    ].join("; ")
  );

  return response;
}

export async function middleware(request: NextRequest) {
  // NextAuth認証を実行
  const authResult = await auth(request as any, {} as any);

  // レスポンスにセキュリティヘッダーを追加
  const response = authResult instanceof NextResponse
    ? authResult
    : NextResponse.next();

  return addSecurityHeaders(response);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/superadmin/:path*",
    "/login",
    "/signup",
    "/notifications/:path*",
  ],
};
