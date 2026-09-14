import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/presidin/theme-provider";
import { QueryProvider } from "@/components/presidin/query-provider";
import { ErrorBoundary } from "@/components/presidin/error-boundary";
import { AuthProvider } from "@/components/presidin/auth-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PRESIDIN — Unified Trading Intelligence",
  description:
    "PRESIDIN is a unified, cross-platform trading intelligence platform that fuses multi-agent signal generation, self-improving ML, a quant research lab, live execution, risk tooling, an AI assistant, and a built-in audio engine — into one native-grade app for iOS, Android, Web, Desktop and PWA.",
  keywords: [
    "PRESIDIN",
    "forex",
    "trading",
    "multi-agent",
    "quant lab",
    "Deriv",
    "MT5",
    "machine learning",
    "risk management",
    "audio engine",
  ],
  authors: [{ name: "PRESIDIN" }],
  applicationName: "PRESIDIN",
  appleWebApp: {
    capable: true,
    title: "PRESIDIN",
    statusBarStyle: "black-translucent",
  },
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: {
    title: "PRESIDIN — Unified Trading Intelligence",
    description:
      "Multi-agent signals, self-improving ML, quant lab, live execution, risk, AI chat, audio — one app.",
    siteName: "PRESIDIN",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#06081A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <QueryProvider>
            <AuthProvider>
              <ErrorBoundary>
                <div className="aurora-bg" aria-hidden />
                <div className="relative z-10">{children}</div>
                <Toaster />
                <Sonner position="top-right" richColors closeButton />
              </ErrorBoundary>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
