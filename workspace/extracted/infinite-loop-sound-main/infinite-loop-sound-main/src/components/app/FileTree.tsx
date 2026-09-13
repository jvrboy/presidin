// Lightweight collapsible file-tree, used in the /welcome showcase
// to give a sense of the project surface area. Pure presentational.
import { useState } from "react";
import { ChevronRight, Folder, FileCode, FileText } from "lucide-react";

export interface FileNode {
  name: string;
  type: "file" | "dir";
  children?: FileNode[];
  hint?: string;
}

const iconFor = (n: FileNode) => {
  if (n.type === "dir") return <Folder className="w-3.5 h-3.5 text-amber-400/80" />;
  if (n.name.endsWith(".md")) return <FileText className="w-3.5 h-3.5 text-muted-foreground" />;
  return <FileCode className="w-3.5 h-3.5 text-sky-400/80" />;
};

function Node({ node, depth = 0 }: { node: FileNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 1);
  const isDir = node.type === "dir";
  return (
    <div>
      <button
        type="button"
        onClick={() => isDir && setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted/40 text-left text-xs font-mono"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isDir ? (
          <ChevronRight
            className={`w-3 h-3 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          />
        ) : (
          <span className="w-3" />
        )}
        {iconFor(node)}
        <span className="truncate">{node.name}</span>
        {node.hint && (
          <span className="ml-auto text-[10px] text-muted-foreground italic">{node.hint}</span>
        )}
      </button>
      {isDir && open && node.children && (
        <div>
          {node.children.map((c) => (
            <Node key={c.name} node={c} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({ root }: { root: FileNode }) {
  return (
    <div className="rounded-xl border border-border bg-card/50 backdrop-blur p-2 font-mono">
      <Node node={root} />
    </div>
  );
}
