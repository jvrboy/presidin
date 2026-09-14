import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/presidin/theme-provider";
import { QueryProvider } from "@/components/presidin/query-provider";
import { ErrorBoundary } from "@/components/presidin/error-boundary";

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
    "PRESIDIN is a unified trading intelligence platform with multi-agent signal generation, self-improving ML, live execution, risk tooling, an AI assistant, and a built-in audio engine.",
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
            <ErrorBoundary>
              <div className="aurora-bg" aria-hidden />
              <div className="relative z-10">{children}</div>
              <Toaster />
              <Sonner position="top-right" richColors closeButton />
            </ErrorBoundary>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
