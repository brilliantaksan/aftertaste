import React from "react";
import { createRoot } from "react-dom/client";
import HomePage from "./HomePage.js";

let root: ReturnType<typeof createRoot> | null = null;

export function mountHomeView(): void {
  const container = document.getElementById("view-home");
  if (!container) return;
  if (!root) {
    root = createRoot(container);
  }
  root.render(
    <React.StrictMode>
      <HomePage
        onNavigate={(view) => {
          document.dispatchEvent(
            new CustomEvent("aftertaste:navigate", { detail: { view } })
          );
        }}
      />
    </React.StrictMode>
  );
}
