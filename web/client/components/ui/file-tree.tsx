"use client";

import * as React from "react";
import {
  ChevronRight,
  File,
  FileCode2,
  FileImage,
  FileJson2,
  FileText,
  Folder,
  FolderOpen,
} from "lucide-react";

import { cn } from "../../lib/utils.js";

export interface FileNode {
  name: string;
  type: "file" | "folder";
  path?: string;
  children?: FileNode[];
  extension?: string;
  isActive?: boolean;
  defaultOpen?: boolean;
}

interface FileTreeProps {
  data: FileNode[];
  className?: string;
  onSelect?: (path: string) => void;
}

interface FileItemProps {
  node: FileNode;
  depth: number;
  isLast: boolean;
  parentPath: boolean[];
  onSelect?: (path: string) => void;
}

type IconDef = {
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
};

const fileIconMap: Record<string, IconDef> = {
  tsx: {
    icon: FileCode2,
    colorClass: "text-[rgba(70,113,168,0.92)]",
  },
  ts: {
    icon: FileCode2,
    colorClass: "text-[rgba(65,87,121,0.88)]",
  },
  jsx: {
    icon: FileCode2,
    colorClass: "text-[rgba(86,137,166,0.9)]",
  },
  js: {
    icon: FileCode2,
    colorClass: "text-[rgba(164,128,70,0.92)]",
  },
  css: {
    icon: FileCode2,
    colorClass: "text-[rgba(133,103,154,0.88)]",
  },
  json: {
    icon: FileJson2,
    colorClass: "text-[rgba(155,122,70,0.9)]",
  },
  md: {
    icon: FileText,
    colorClass: "text-[color:var(--ink-soft)]",
  },
  svg: {
    icon: FileImage,
    colorClass: "text-[rgba(85,132,114,0.9)]",
  },
  png: {
    icon: FileImage,
    colorClass: "text-[rgba(85,132,114,0.82)]",
  },
  jpg: {
    icon: FileImage,
    colorClass: "text-[rgba(85,132,114,0.82)]",
  },
  jpeg: {
    icon: FileImage,
    colorClass: "text-[rgba(85,132,114,0.82)]",
  },
  webp: {
    icon: FileImage,
    colorClass: "text-[rgba(85,132,114,0.82)]",
  },
  default: {
    icon: File,
    colorClass: "text-[color:var(--ink-faint)]",
  },
};

function getFileIcon(extension?: string): IconDef {
  if (!extension) return fileIconMap.default;
  return fileIconMap[extension] ?? fileIconMap.default;
}

function containsActiveNode(node: FileNode): boolean {
  if (node.isActive) return true;
  return (node.children ?? []).some((child) => containsActiveNode(child));
}

function FileItem({ node, depth, isLast, parentPath, onSelect }: FileItemProps) {
  const isFolder = node.type === "folder";
  const hasChildren = isFolder && (node.children?.length ?? 0) > 0;
  const hasActiveDescendant = containsActiveNode(node);
  const [isOpen, setIsOpen] = React.useState(node.defaultOpen ?? hasActiveDescendant);
  const fileIcon = getFileIcon(node.extension);
  const FileIcon = fileIcon.icon;
  const rowIndent = depth * 18 + 10;
  const connectorX = (depth - 1) * 18 + 18;

  React.useEffect(() => {
    if (hasActiveDescendant) setIsOpen(true);
  }, [hasActiveDescendant]);

  return (
    <div className="select-none">
      <button
        type="button"
        className={cn(
          "group relative flex w-full items-center gap-2 rounded-xl border py-1.5 pr-3 text-left transition-all duration-200 ease-out",
          "border-transparent",
          node.isActive
            ? "bg-[rgba(215,228,255,0.52)] text-[color:var(--ink)] shadow-[0_12px_26px_rgba(48,59,77,0.08)]"
            : "bg-transparent text-[color:var(--ink-soft)] hover:border-[rgba(68,83,101,0.08)] hover:bg-[rgba(255,255,255,0.76)] hover:text-[color:var(--ink)]",
        )}
        style={{ paddingLeft: `${rowIndent}px` }}
        aria-current={node.isActive ? "page" : undefined}
        aria-expanded={isFolder ? isOpen : undefined}
        onClick={() => {
          if (isFolder) {
            setIsOpen((open) => !open);
            return;
          }
          if (node.path && onSelect) onSelect(node.path);
        }}
      >
        {parentPath.map((showLine, index) =>
          showLine ? (
            <span
              key={`parent-line-${index}`}
              aria-hidden="true"
              className="pointer-events-none absolute bottom-[-10px] top-[-10px] w-px bg-[rgba(68,83,101,0.12)] transition-colors duration-200 group-hover:bg-[rgba(68,83,101,0.22)]"
              style={{ left: `${index * 18 + 18}px` }}
            />
          ) : null,
        )}

        {depth > 0 ? (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute w-px bg-[rgba(68,83,101,0.12)] transition-colors duration-200 group-hover:bg-[rgba(68,83,101,0.22)]"
              style={{
                left: `${connectorX}px`,
                top: "-10px",
                bottom: isLast ? "50%" : "-10px",
              }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute h-px bg-[rgba(68,83,101,0.12)] transition-colors duration-200 group-hover:bg-[rgba(68,83,101,0.22)]"
              style={{
                left: `${connectorX}px`,
                top: "50%",
                width: "14px",
              }}
            />
          </>
        ) : null}

        <span className="relative z-10 flex h-4 w-4 items-center justify-center">
          {isFolder ? (
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 text-[color:var(--ink-faint)] transition-all duration-200 group-hover:text-[color:var(--ink)]",
                isOpen && "rotate-90",
              )}
            />
          ) : (
            <span
              aria-hidden="true"
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-all duration-200",
                node.isActive ? "bg-[color:var(--accent)]" : "bg-[rgba(68,83,101,0.3)] group-hover:bg-[rgba(68,83,101,0.52)]",
              )}
            />
          )}
        </span>

        <span
          className={cn(
            "relative z-10 flex h-5 w-5 items-center justify-center rounded-md transition-all duration-200",
            isFolder
              ? "text-[rgba(120,91,58,0.92)] group-hover:scale-105 group-hover:text-[rgba(93,74,48,0.98)]"
              : cn(fileIcon.colorClass, "group-hover:scale-105"),
          )}
        >
          {isFolder ? (
            isOpen ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />
          ) : (
            <FileIcon className="h-4 w-4" />
          )}
        </span>

        <span
          className={cn(
            "relative z-10 min-w-0 truncate font-[var(--font-mono)] text-[13px] transition-colors duration-200",
            isFolder
              ? "text-[rgba(39,51,67,0.94)] group-hover:text-[color:var(--ink)]"
              : "text-[color:var(--ink-soft)] group-hover:text-[color:var(--ink)]",
            node.isActive && "text-[color:var(--ink)]",
          )}
        >
          {node.name}
        </span>

        <span
          aria-hidden="true"
          className={cn(
            "absolute right-2 h-1.5 w-1.5 rounded-full bg-[rgba(102,126,160,0.86)] transition-all duration-200",
            node.isActive ? "scale-100 opacity-100" : "scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-100",
          )}
        />
      </button>

      {hasChildren ? (
        <div
          className={cn(
            "grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-out",
            isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="min-h-0">
            {node.children?.map((child, index) => (
              <FileItem
                key={child.path ?? `${child.name}-${index}`}
                node={child}
                depth={depth + 1}
                isLast={index === (node.children?.length ?? 0) - 1}
                parentPath={[...parentPath, !isLast]}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function FileTree({ data, className, onSelect }: FileTreeProps) {
  return (
    <div
      className={cn(
        "wiki-file-tree-shell rounded-[28px] border border-[rgba(68,83,101,0.12)] bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(250,246,240,0.76))] p-3 shadow-[0_18px_44px_rgba(48,59,77,0.10)] backdrop-blur-sm",
        className,
      )}
    >
      <div className="wiki-file-tree-header mb-2 flex items-center gap-2 border-b border-[rgba(68,83,101,0.1)] pb-3">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.65_0.2_25)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.75_0.18_85)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.65_0.18_150)]" />
        </div>
        <span className="ml-2 text-[11px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
          explorer
        </span>
      </div>

      <div className="space-y-0.5">
        {data.map((node, index) => (
          <FileItem
            key={node.path ?? `${node.name}-${index}`}
            node={node}
            depth={0}
            isLast={index === data.length - 1}
            parentPath={[]}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
