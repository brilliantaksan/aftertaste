export interface TreeNode {
  name: string;
  path: string;
  kind: "file" | "dir";
  children?: TreeNode[];
}

function studioHref(path: string): string {
  return `/?view=studio&page=${encodeURIComponent(path)}`;
}

export function renderTree(
  container: HTMLElement,
  root: TreeNode,
  onSelect: (path: string) => void,
): void {
  container.innerHTML = "";
  const ul = document.createElement("ul");
  renderNode(ul, root, onSelect, true);
  container.appendChild(ul);
}

function renderNode(
  parent: HTMLElement,
  node: TreeNode,
  onSelect: (path: string) => void,
  isRoot: boolean,
): void {
  if (node.kind === "dir") {
    if (!isRoot) {
      const li = document.createElement("li");

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tree-dir is-open";
      btn.textContent = node.name;
      li.appendChild(btn);

      const childWrapper = document.createElement("div");
      childWrapper.className = "tree-children";

      const ul = document.createElement("ul");
      for (const child of node.children ?? []) {
        renderNode(ul, child, onSelect, false);
      }
      childWrapper.appendChild(ul);
      li.appendChild(childWrapper);

      // Set initial max-height after layout so transition has a start value
      requestAnimationFrame(() => {
        childWrapper.style.maxHeight = `${childWrapper.scrollHeight}px`;
      });

      btn.addEventListener("click", () => {
        const isOpen = btn.classList.contains("is-open");
        if (isOpen) {
          // Animate closed: lock to current height first, then collapse
          childWrapper.style.maxHeight = `${childWrapper.scrollHeight}px`;
          requestAnimationFrame(() => {
            childWrapper.style.maxHeight = "0";
          });
          btn.classList.remove("is-open");
          childWrapper.classList.add("is-collapsed");
        } else {
          // Animate open
          childWrapper.classList.remove("is-collapsed");
          childWrapper.style.maxHeight = `${childWrapper.scrollHeight}px`;
          btn.classList.add("is-open");
        }
      });

      parent.appendChild(li);
    } else {
      // Root dir: render children directly without wrapping li
      const ul = document.createElement("ul");
      for (const child of node.children ?? []) {
        renderNode(ul, child, onSelect, false);
      }
      parent.appendChild(ul);
    }
  } else {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = studioHref(node.path);
    a.textContent = node.name;
    a.setAttribute("data-path", node.path);
    a.addEventListener("click", (e) => {
      e.preventDefault();
      onSelect(node.path);
    });
    li.appendChild(a);
    parent.appendChild(li);
  }
}
