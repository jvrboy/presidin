import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Forex Bot Control',
  description: 'Live forex trading bot dashboard',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b1220',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: '#0b1220',
          color: '#e2e8f0',
          minHeight: '100dvh',
          overflowX: 'hidden',
          WebkitTextSizeAdjust: '100%',
        }}
      >
        {children}
      </body>
    </html>
  );
}
