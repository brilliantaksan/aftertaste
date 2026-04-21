import React from "react";
import { createRoot, type Root } from "react-dom/client";

import { FileTree, type FileNode } from "./components/ui/file-tree.js";

export interface TreeNode {
  name: string;
  path: string;
  kind: "file" | "dir";
  children?: TreeNode[];
}

const treeRoots = new WeakMap<HTMLElement, Root>();

export function renderTree(
  container: HTMLElement,
  root: TreeNode,
  onSelect: (path: string) => void,
  activePath?: string,
): void {
  let rootRenderer = treeRoots.get(container);
  if (!rootRenderer) {
    rootRenderer = createRoot(container);
    treeRoots.set(container, rootRenderer);
  }

  rootRenderer.render(
    <React.StrictMode>
      <FileTree data={mapTreeNodes(root.children ?? [], activePath)} onSelect={onSelect} />
    </React.StrictMode>,
  );
}

function mapTreeNodes(nodes: TreeNode[], activePath?: string): FileNode[] {
  return nodes.map((node) => ({
    name: node.name,
    path: node.kind === "file" ? node.path : undefined,
    type: node.kind === "dir" ? "folder" : "file",
    extension: node.kind === "file" ? getExtension(node.name) : undefined,
    isActive: node.kind === "file" ? node.path === activePath : false,
    defaultOpen: node.kind === "dir" ? true : undefined,
    children: node.kind === "dir" ? mapTreeNodes(node.children ?? [], activePath) : undefined,
  }));
}

function getExtension(name: string): string | undefined {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match?.[1]?.toLowerCase();
}
