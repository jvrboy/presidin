// Sidebar panel: Artifacts list (JSON/CSV/HTML/etc generated in chat).
import { useArtifacts } from "@/hooks/use-chat-store";
import { FileJson, FileText, FileCode, Download, Trash, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";

const iconFor = (kind: string) => {
  if (kind === "json") return <FileJson className="w-3.5 h-3.5 text-amber-400" />;
  if (kind === "csv") return <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />;
  if (["html", "css", "js", "ts", "py"].includes(kind))
    return <FileCode className="w-3.5 h-3.5 text-sky-400" />;
  return <FileText className="w-3.5 h-3.5 text-muted-foreground" />;
};

const MIME_FOR: Record<string, string> = {
  json: "application/json",
  csv: "text/csv",
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  ts: "text/typescript",
  py: "text/x-python",
  md: "text/markdown",
  pdf: "application/pdf",
  txt: "text/plain",
};

export function ArtifactsPanel({ threadId }: { threadId?: string | null }) {
  const { forThread, remove } = useArtifacts(threadId);

  const download = (name: string, kind: string, content: string) => {
    const blob = new Blob([content], { type: MIME_FOR[kind] || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 mb-1">
        {forThread.length} artifact{forThread.length === 1 ? "" : "s"} for this chat
      </p>
      {forThread.length === 0 && (
        <p className="text-xs text-muted-foreground italic px-2 py-3">
          The agent will save generated JSON/CSV/HTML/etc. here.
        </p>
      )}
      {forThread.map((a) => (
        <div key={a.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted/40 group">
          {iconFor(a.kind)}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-mono truncate">{a.name}</div>
            <div className="text-[10px] text-muted-foreground">
              {a.kind.toUpperCase()} · {(a.bytes / 1024).toFixed(1)} KB
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 opacity-0 group-hover:opacity-100"
            onClick={() => download(a.name, a.kind, a.content)}
            title="Download"
          >
            <Download className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 opacity-0 group-hover:opacity-100 hover:text-red-400"
            onClick={() => remove(a.id)}
            title="Delete"
          >
            <Trash className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
