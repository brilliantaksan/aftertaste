import { FileTree } from "./file-tree.js";

const fileStructure = [
  {
    name: "src",
    type: "folder" as const,
    defaultOpen: true,
    children: [
      {
        name: "components",
        type: "folder" as const,
        defaultOpen: true,
        children: [
          { name: "button.tsx", type: "file" as const, extension: "tsx" },
          { name: "card.tsx", type: "file" as const, extension: "tsx" },
          { name: "input.tsx", type: "file" as const, extension: "tsx" },
        ],
      },
      {
        name: "hooks",
        type: "folder" as const,
        defaultOpen: true,
        children: [
          { name: "use-theme.ts", type: "file" as const, extension: "ts" },
          { name: "use-auth.ts", type: "file" as const, extension: "ts" },
        ],
      },
      { name: "app.tsx", type: "file" as const, extension: "tsx" },
      { name: "index.tsx", type: "file" as const, extension: "tsx" },
    ],
  },
  {
    name: "public",
    type: "folder" as const,
    defaultOpen: true,
    children: [
      { name: "logo.svg", type: "file" as const, extension: "svg" },
      { name: "favicon.png", type: "file" as const, extension: "png" },
    ],
  },
  { name: "package.json", type: "file" as const, extension: "json" },
  { name: "README.md", type: "file" as const, extension: "md" },
  { name: "styles.css", type: "file" as const, extension: "css" },
];

export default function FileTreeDemo() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-xs">
        <FileTree data={fileStructure} />
      </div>
    </main>
  );
}
