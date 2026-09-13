import type { PropsWithChildren } from "react";

export default function RootHtml({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#070B12" />
        <meta name="description" content="Nexus Trade command center for Android, iOS, and Windows web." />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icon.png" />
        <style dangerouslySetInnerHTML={{ __html: "#root,body,html{height:100%}body{overflow:hidden}#root{display:flex}" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
