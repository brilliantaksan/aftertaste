import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const SCRAMBLE_SPEED = 10;
const CYCLES_PER_LETTER = 3;
const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%^&*()_+";

interface HyperTextProps {
  text: string;
  className?: string;
  highlightWords?: string[];
  onWordClick?: (word: string) => void;
  onWordHoverStart?: (word: string) => void;
  onWordHoverEnd?: (word: string) => void;
}

interface WordProps {
  children: string;
  isDimmed: boolean;
  isHighlightable: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  onClick?: () => void;
}

const Word = ({ children, isDimmed, isHighlightable, onHoverStart, onHoverEnd, onClick }: WordProps) => {
  const [displayText, setDisplayText] = useState(children);
  const [isHovered, setIsHovered] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const scramble = useCallback(() => {
    let pos = 0;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const scrambled = children.split("").map((char, index) => {
        if (pos / CYCLES_PER_LETTER > index) return char;
        return CHARS[Math.floor(Math.random() * CHARS.length)];
      }).join("");
      setDisplayText(scrambled);
      pos++;
      if (pos >= children.length * CYCLES_PER_LETTER) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setDisplayText(children);
      }
    }, SCRAMBLE_SPEED);
  }, [children]);

  const stopScramble = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setDisplayText(children);
  }, [children]);

  const handleMouseEnter = () => {
    if (isHighlightable) { setIsHovered(true); onHoverStart(); scramble(); }
  };
  const handleMouseLeave = () => {
    if (isHighlightable) { setIsHovered(false); onHoverEnd(); stopScramble(); }
  };

  return (
    <motion.span
      className={`relative inline-block whitespace-nowrap ${isHighlightable ? "cursor-pointer" : "cursor-default"}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={isHighlightable ? onClick : undefined}
      animate={{
        opacity: isDimmed && !isHovered ? 0.25 : 1,
        filter: isDimmed && !isHovered ? "blur(1.5px)" : "blur(0px)",
        color: isHovered ? "#FFFFFF" : isHighlightable ? "#c2762a" : "#273343",
        zIndex: isHovered ? 20 : 1,
      }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <AnimatePresence>
        {isHovered && (
          <motion.span
            className="absolute -inset-2 rounded z-[-1]"
            layoutId="hover-bg"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            style={{ background: "#273343", boxShadow: "0px 10px 25px -5px rgba(194,118,42,0.35), 0px 8px 10px -6px rgba(0,0,0,0.1)" }}
          />
        )}
      </AnimatePresence>
      {/* Width anchor: invisible, always the original word — prevents layout reflow */}
      <span className="relative z-10 px-1" style={{ visibility: "hidden", display: "inline-block" }} aria-hidden="true">
        {children}
      </span>
      {/* Scrambled text: clipped horizontally only, extended vertically for descenders */}
      <span className="absolute z-10 px-1 overflow-hidden" style={{ top: "-0.15em", left: 0, right: 0, bottom: "-0.4em", display: "flex", alignItems: "center" }}>
        {displayText}
      </span>
      <AnimatePresence>
        {isHovered && (
          <>
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute -top-1 -right-1 w-2 h-2 rounded-full z-20" style={{ background: "#c2762a" }} />
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute -bottom-1 -left-1 w-2 h-2 rounded-full z-20" style={{ background: "#f5d7a8" }} />
          </>
        )}
      </AnimatePresence>
    </motion.span>
  );
};

export default function HyperTextParagraph({
  text,
  className = "",
  highlightWords = [],
  onWordClick,
  onWordHoverStart,
  onWordHoverEnd,
}: HyperTextProps) {
  const [isParagraphHovered, setIsParagraphHovered] = useState(false);
  const words = text.split(" ");
  const clean = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "");

  return (
    <div className={`leading-relaxed tracking-wide ${className}`}>
      {words.map((word, i) => {
        const isHighlightable = highlightWords.some(hw => clean(hw) === clean(word));
        return (
          <React.Fragment key={i}>
            <Word
              isDimmed={isParagraphHovered}
              isHighlightable={isHighlightable}
              onHoverStart={() => {
                setIsParagraphHovered(true);
                onWordHoverStart?.(word);
              }}
              onHoverEnd={() => {
                setIsParagraphHovered(false);
                onWordHoverEnd?.(word);
              }}
              onClick={() => onWordClick?.(word)}
            >
              {word}
            </Word>
            <span className="inline-block whitespace-pre"> </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}
