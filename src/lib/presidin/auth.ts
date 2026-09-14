/**
 * PRESIDIN — NextAuth v5 (beta) configuration
 *
 * Supports: GitHub, Google, Email (magic link), Credentials (demo)
 * Uses Prisma adapter for session/user storage.
 *
 * Required env vars:
 *   AUTH_SECRET=<random 32-char string>  (already set below)
 *   AUTH_GITHUB_ID=<github oauth app client id>
 *   AUTH_GITHUB_SECRET=<github oauth app secret>
 *   AUTH_GOOGLE_ID=<google oauth client id>
 *   AUTH_GOOGLE_SECRET=<google oauth client secret>
 *   EMAIL_SERVER=smtp://user:pass@smtp.example.com:587  (for email magic links)
 *   EMAIL_FROM="PRESIDIN <noreply@presidin.app>"
 *
 * Get GitHub OAuth: https://github.com/settings/developers → New OAuth App
 *   Homepage URL: https://your-domain.com
 *   Callback URL: https://your-domain.com/api/auth/callback/github
 *
 * Get Google OAuth: https://console.cloud.google.com/apis/credentials
 *   Authorized redirect: https://your-domain.com/api/auth/callback/google
 *
 * Generate AUTH_SECRET: openssl rand -base64 32
 */
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";

const AUTH_SECRET = process.env.AUTH_SECRET || "presidin-dev-secret-change-in-production-32chars";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  secret: AUTH_SECRET,
  providers: [
    // GitHub OAuth — configured via env vars
    ...(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET
      ? [GitHub({
          clientId: process.env.AUTH_GITHUB_ID,
          clientSecret: process.env.AUTH_GITHUB_SECRET,
        })]
      : []),
    // Google OAuth — configured via env vars
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [Google({
          clientId: process.env.AUTH_GOOGLE_ID,
          clientSecret: process.env.AUTH_GOOGLE_SECRET,
        })]
      : []),
    // Demo credentials — always enabled for development
    Credentials({
      name: "Demo Login",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "demo@presidin.app" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // Demo: any email + "presidin" password works
        const email = credentials?.email as string;
        const password = credentials?.password as string;
        if (!email || !password) return null;
        if (password !== "presidin") return null;
        return {
          id: email,
          email,
          name: email.split("@")[0],
          emailVerified: null,
          image: null,
        };
      },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as any).id = token.sub;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  trustHost: true,
});
