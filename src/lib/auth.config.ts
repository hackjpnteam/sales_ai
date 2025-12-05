import type { NextAuthConfig } from "next-auth";

// Edge-compatible auth config (no DB access)
export const authConfig: NextAuthConfig = {
  providers: [], // Providers are added in auth.ts
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;
      const userEmail = auth?.user?.email?.toLowerCase();

      const SUPER_ADMIN_EMAILS = ["tomura@hackjpn.com"];

      const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/signup");
      const isDashboard = pathname.startsWith("/dashboard");
      const isSuperAdmin = pathname.startsWith("/superadmin");

      // Redirect logged-in users away from auth pages
      if (isAuthPage && isLoggedIn) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      // Protect dashboard routes
      if (isDashboard && !isLoggedIn) {
        const callbackUrl = encodeURIComponent(pathname);
        return Response.redirect(new URL(`/login?callbackUrl=${callbackUrl}`, nextUrl));
      }

      // Protect super admin routes
      if (isSuperAdmin) {
        if (!isLoggedIn) {
          return Response.redirect(new URL("/login", nextUrl));
        }
        if (!userEmail || !SUPER_ADMIN_EMAILS.includes(userEmail)) {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
};
