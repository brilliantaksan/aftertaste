import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "../../lib/utils.js";

type ExpandingSearchDockFilter = {
  value: string;
  label: string;
};

type ExpandingSearchDockProps = {
  expanded?: boolean;
  query?: string;
  onSearch?: (query: string) => void;
  onExpand?: () => void;
  onCollapse?: () => void;
  onQueryChange?: (query: string) => void;
  placeholder?: string;
  filters?: ExpandingSearchDockFilter[];
  activeFilter?: string;
  onFilterSelect?: (value: string) => void;
};

export function ExpandingSearchDock({
  expanded = false,
  query = "",
  onSearch,
  onExpand,
  onCollapse,
  onQueryChange,
  placeholder = "Search...",
  filters = [],
  activeFilter = "all",
  onFilterSelect,
}: ExpandingSearchDockProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (expanded) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [expanded]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch?.(query);
  };

  return (
    <div className="header-search-dock-shell">
      <motion.button
        initial={false}
        animate={{
          opacity: expanded ? 0 : 1,
          scale: expanded ? 0.9 : 1,
          y: expanded ? -3 : 0,
        }}
        transition={{
          type: "spring",
          stiffness: 420,
          damping: 34,
        }}
        onClick={onExpand}
        className="nav-pill header-search-trigger"
        type="button"
        tabIndex={expanded ? -1 : 0}
        aria-hidden={expanded}
        style={{ pointerEvents: expanded ? "none" : "auto" }}
      >
        <Search className="h-4 w-4" />
        <span>Search</span>
      </motion.button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <div className="header-search-dock-overlay">
            <motion.form
              key="expanded"
              initial={{ opacity: 0, scaleX: 0.54, y: -8 }}
              animate={{ opacity: 1, scaleX: 1, y: 0 }}
              exit={{ opacity: 0, scaleX: 0.88, y: -6 }}
              transition={{
                type: "spring",
                stiffness: 340,
                damping: 30,
              }}
              onSubmit={handleSubmit}
              className="header-search-dock-expanded"
            >
              <div className="header-search-dock-input-row">
                <div className="header-search-dock-leading">
                  <Search className="h-5 w-5" />
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => onQueryChange?.(e.target.value)}
                  placeholder={placeholder}
                  className="header-search-dock-input"
                />
                <motion.button
                  type="button"
                  onClick={onCollapse}
                  initial={{ scale: 0.84, opacity: 0.7 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.94 }}
                  className="header-search-dock-close"
                >
                  <X className="h-4 w-4" />
                </motion.button>
              </div>
              {filters.length > 0 ? (
                <motion.div
                  className="header-search-dock-filter-rail"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1], delay: 0.02 }}
                >
                  <div className="header-search-dock-filters">
                    {filters.map((filter) => (
                      <button
                        key={filter.value}
                        type="button"
                        onClick={() => onFilterSelect?.(filter.value)}
                        className={cn(
                          "header-search-filter-pill",
                          activeFilter === filter.value && "header-search-filter-pill-active",
                        )}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                </motion.div>
              ) : null}
            </motion.form>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
