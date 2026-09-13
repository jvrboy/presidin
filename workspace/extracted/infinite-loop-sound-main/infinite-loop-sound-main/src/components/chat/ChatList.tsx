// Sidebar panel: Chats list. Rename, delete, pin, archive, clone, restore, move per row.
// Extended: folder grouping, create/rename/delete folders, move chats between folders.
import { useState } from "react";
import {
  MessageSquare,
  MoreVertical,
  Pin,
  PinOff,
  Trash,
  Pencil,
  Archive,
  ArchiveRestore,
  Copy,
  FolderPlus,
  Folder,
  ChevronRight,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Thread, ChatFolder } from "@/hooks/use-chat-store";

export function ChatList({
  threads,
  folders,
  activeId,
  onPick,
  onRename,
  onDelete,
  onTogglePin,
  onToggleArchive,
  onClone,
  onRestore,
  onMove,
  showArchived,
  showTrash,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}: {
  threads: Thread[];
  folders: ChatFolder[];
  activeId: string | null;
  onPick: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleArchive: (id: string) => void;
  onClone: (id: string) => void;
  onRestore: (id: string) => void;
  onMove: (id: string, folderId: string | null) => void;
  showArchived: boolean;
  showTrash: boolean;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [folderEditing, setFolderEditing] = useState<string | null>(null);
  const [folderDraft, setFolderDraft] = useState("");
  const [newFolderName, setNewFolderName] = useState("");

  const visible = threads.filter((t) => {
    if (showTrash) return t.deleted;
    if (showArchived) return t.archived && !t.deleted;
    return !t.archived && !t.deleted;
  });

  const unfoldered = visible.filter((t) => !t.folderId);
  unfoldered.sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return b.updated - a.updated;
  });

  const foldered = (folderId: string) => visible.filter((t) => t.folderId === folderId);
  const toggleFolder = (id: string) => setExpandedFolders((p) => ({ ...p, [id]: !p[id] }));

  const renderRow = (t: Thread) => {
    const isActive = t.id === activeId;
    const isEditing = editing === t.id;
    return (
      <div
        key={t.id}
        className={`group relative flex items-center gap-2 p-2 rounded transition-colors ${isActive ? "bg-muted" : "hover:bg-muted/40"}`}
      >
        <button
          type="button"
          onClick={() => onPick(t.id)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          {t.pinned ? (
            <Pin className="w-3 h-3 text-amber-400 shrink-0" />
          ) : (
            <MessageSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          )}
          {isEditing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                if (draft.trim()) onRename(t.id, draft.trim());
                setEditing(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (draft.trim()) onRename(t.id, draft.trim());
                  setEditing(null);
                }
                if (e.key === "Escape") setEditing(null);
              }}
              className="bg-background border border-border rounded px-1.5 py-0.5 text-xs flex-1 min-w-0"
            />
          ) : (
            <span className="text-xs truncate">
              {t.title}
              {t.clonedFrom && (
                <span className="text-[9px] text-muted-foreground ml-1">(clone)</span>
              )}
            </span>
          )}
        </button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenu(openMenu === t.id ? null : t.id);
          }}
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </Button>
        {openMenu === t.id && (
          <div
            onMouseLeave={() => setOpenMenu(null)}
            className="absolute right-2 top-full mt-1 z-20 rounded-md border border-border bg-popover shadow-md p-1 w-48"
          >
            <button
              className="flex items-center gap-2 w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted"
              onClick={() => {
                setEditing(t.id);
                setDraft(t.title);
                setOpenMenu(null);
              }}
            >
              <Pencil className="w-3 h-3" /> Rename
            </button>
            <button
              className="flex items-center gap-2 w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted"
              onClick={() => {
                onTogglePin(t.id);
                setOpenMenu(null);
              }}
            >
              {t.pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
              {t.pinned ? "Unpin" : "Pin"}
            </button>
            <button
              className="flex items-center gap-2 w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted"
              onClick={() => {
                onToggleArchive(t.id);
                setOpenMenu(null);
              }}
            >
              {t.archived ? (
                <ArchiveRestore className="w-3 h-3" />
              ) : (
                <Archive className="w-3 h-3" />
              )}
              {t.archived ? "Unarchive" : "Archive"}
            </button>
            <button
              className="flex items-center gap-2 w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted"
              onClick={() => {
                onClone(t.id);
                setOpenMenu(null);
              }}
            >
              <Copy className="w-3 h-3" /> Clone
            </button>
            {showTrash && (
              <button
                className="flex items-center gap-2 w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted text-emerald-400"
                onClick={() => {
                  onRestore(t.id);
                  setOpenMenu(null);
                }}
              >
                <RotateCcw className="w-3 h-3" /> Restore
              </button>
            )}
            <div className="border-t border-border my-1" />
            <div className="px-2 py-1 text-[10px] text-muted-foreground">Move to folder:</div>
            <button
              className="flex items-center gap-2 w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted"
              onClick={() => {
                onMove(t.id, null);
                setOpenMenu(null);
              }}
            >
              <MessageSquare className="w-3 h-3" /> No folder
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                className="flex items-center gap-2 w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted"
                onClick={() => {
                  onMove(t.id, f.id);
                  setOpenMenu(null);
                }}
              >
                <Folder className="w-3 h-3" style={{ color: f.color }} /> {f.name}
              </button>
            ))}
            <div className="border-t border-border my-1" />
            <button
              className="flex items-center gap-2 w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted text-red-400"
              onClick={() => {
                if (confirm(`Delete "${t.title}"? This moves it to trash.`)) {
                  onDelete(t.id);
                }
                setOpenMenu(null);
              }}
            >
              <Trash className="w-3 h-3" /> {showTrash ? "Delete forever" : "Move to trash"}
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderFolder = (f: ChatFolder) => {
    const chats = foldered(f.id);
    const expanded = expandedFolders[f.id] ?? true;
    return (
      <div key={f.id} className="space-y-0.5">
        <div className="group flex items-center gap-1 px-2 py-1">
          <button
            onClick={() => toggleFolder(f.id)}
            className="flex items-center gap-1 flex-1 min-w-0"
          >
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <Folder className="w-3.5 h-3.5" style={{ color: f.color }} />
            {folderEditing === f.id ? (
              <input
                autoFocus
                value={folderDraft}
                onChange={(e) => setFolderDraft(e.target.value)}
                onBlur={() => {
                  if (folderDraft.trim()) onRenameFolder(f.id, folderDraft.trim());
                  setFolderEditing(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (folderDraft.trim()) onRenameFolder(f.id, folderDraft.trim());
                    setFolderEditing(null);
                  }
                  if (e.key === "Escape") setFolderEditing(null);
                }}
                className="bg-background border border-border rounded px-1.5 py-0.5 text-xs flex-1 min-w-0"
              />
            ) : (
              <span className="text-xs font-medium truncate">{f.name}</span>
            )}
            <span className="text-[10px] text-muted-foreground">{chats.length}</span>
          </button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5 opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              setFolderEditing(f.id);
              setFolderDraft(f.name);
            }}
          >
            <Pencil className="w-2.5 h-2.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5 opacity-0 group-hover:opacity-100 hover:text-red-400"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete folder "${f.name}"? Chats will be moved to no folder.`)) {
                onDeleteFolder(f.id);
              }
            }}
          >
            <Trash className="w-2.5 h-2.5" />
          </Button>
        </div>
        {expanded && chats.map(renderRow)}
      </div>
    );
  };

  if (visible.length === 0 && folders.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic px-2 py-4">
        {showTrash
          ? "Trash is empty."
          : showArchived
            ? "No archived chats."
            : "No chats yet. Start one!"}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {!showTrash && !showArchived && (
        <div className="flex gap-1 px-2 py-1">
          <input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="New folder…"
            className="bg-background border border-border rounded px-1.5 py-0.5 text-xs flex-1 min-w-0"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newFolderName.trim()) {
                onCreateFolder(newFolderName.trim());
                setNewFolderName("");
              }
            }}
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => {
              if (newFolderName.trim()) {
                onCreateFolder(newFolderName.trim());
                setNewFolderName("");
              }
            }}
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
      {folders.map(renderFolder)}
      {unfoldered.length > 0 && folders.length > 0 && (
        <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          No folder
        </div>
      )}
      {unfoldered.map(renderRow)}
    </div>
  );
}
