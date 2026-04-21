import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import {
  ArrowUp,
  Archive,
  Copy,
  FileText,
  FolderOpen,
  ImageIcon,
  Loader2,
  Mic,
  Music,
  Paperclip,
  Sparkles,
  StopCircle,
  UploadCloud,
  Video,
  X,
} from "lucide-react";

import { cn } from "../../lib/utils.js";

interface PromptTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  maxHeight?: number;
}

const PromptTextarea = React.forwardRef<HTMLTextAreaElement, PromptTextareaProps>(
  ({ className, maxHeight = 220, value, ...props }, ref) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

    React.useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

    React.useEffect(() => {
      const node = innerRef.current;
      if (!node) return;
      node.style.height = "0px";
      node.style.height = `${Math.min(node.scrollHeight, maxHeight)}px`;
    }, [value, maxHeight]);

    return (
      <textarea
        ref={innerRef}
        rows={1}
        value={value}
        className={cn(
          "min-h-12 w-full resize-none border-0 bg-transparent px-0 py-0 text-[15px] leading-7 text-[color:var(--ink)] placeholder:text-[color:var(--ink-faint)] focus:outline-none focus:ring-0",
          className,
        )}
        {...props}
      />
    );
  },
);
PromptTextarea.displayName = "PromptTextarea";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 8, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 rounded-full border border-[color:var(--line)] bg-[rgba(39,51,67,0.96)] px-3 py-1.5 text-xs font-medium text-white shadow-[0_18px_48px_rgba(28,36,48,0.22)]",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

const Dialog = DialogPrimitive.Root;
const DialogPortal = DialogPrimitive.Portal;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-[rgba(39,51,67,0.42)] backdrop-blur-md",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 w-[min(92vw,760px)] -translate-x-1/2 -translate-y-1/2 rounded-[32px] border border-[color:var(--line)] bg-[rgba(250,246,240,0.92)] p-3 shadow-[0_30px_90px_rgba(48,59,77,0.24)] focus:outline-none",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--line)] bg-[rgba(255,255,255,0.88)] text-[color:var(--ink-soft)] transition hover:text-[color:var(--ink)]">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

interface FilePreview {
  id: string;
  file: File;
  previewUrl: string | null;
  textPreview: string | null;
}

interface PastedSnippet {
  id: string;
  content: string;
  wordCount: number;
}

export interface PromptSendPayload {
  message: string;
  files: File[];
  collection: string | null;
  pastedContents: string[];
}

interface PromptInputBoxProps {
  onSend: (payload: PromptSendPayload) => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
  helperText?: string;
  collectionOptions?: string[];
  selectedCollection?: string | null;
  onCollectionChange?: (value: string | null) => void;
}

const MAX_ATTACHMENTS = 6;
const MAX_PASTED_SNIPPETS = 4;
const PASTE_PREVIEW_THRESHOLD = 180;
const TEXT_PREVIEW_MAX_BYTES = 180_000;
const TEXT_PREVIEW_MAX_CHARS = 240;

function createClientId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isTextualFile(file: File): boolean {
  if (file.type.startsWith("text/")) return true;
  if (
    [
      "application/json",
      "application/xml",
      "application/javascript",
      "application/typescript",
    ].includes(file.type)
  ) {
    return true;
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return [
    "txt",
    "md",
    "markdown",
    "json",
    "js",
    "ts",
    "jsx",
    "tsx",
    "html",
    "css",
    "csv",
    "xml",
    "yaml",
    "yml",
    "log",
    "sql",
  ].includes(extension);
}

async function readTextPreview(file: File): Promise<string | null> {
  if (!isTextualFile(file) || file.size > TEXT_PREVIEW_MAX_BYTES) return null;
  const text = (await file.text()).replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > TEXT_PREVIEW_MAX_CHARS
    ? `${text.slice(0, TEXT_PREVIEW_MAX_CHARS).trimEnd()}...`
    : text;
}

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / 1024 ** unitIndex;
  return `${size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
}

function getFileBadge(file: File): string {
  if (file.type.startsWith("image/")) return "IMAGE";
  if (file.type.startsWith("video/")) return "VIDEO";
  if (file.type.startsWith("audio/")) return "AUDIO";
  if (isTextualFile(file)) {
    const extension = file.name.split(".").pop()?.toUpperCase() ?? "TEXT";
    return extension.slice(0, 8);
  }
  if (file.type.includes("zip") || file.type.includes("rar") || file.type.includes("tar")) return "ARCHIVE";
  return "FILE";
}

function getFileIcon(file: File): React.JSX.Element {
  if (file.type.startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
  if (file.type.startsWith("video/")) return <Video className="h-4 w-4" />;
  if (file.type.startsWith("audio/")) return <Music className="h-4 w-4" />;
  if (file.type.includes("zip") || file.type.includes("rar") || file.type.includes("tar")) {
    return <Archive className="h-4 w-4" />;
  }
  return <FileText className="h-4 w-4" />;
}

export function PromptInputBox({
  onSend,
  isLoading = false,
  placeholder = "Paste a link, add context if you want, or drop screenshots. Aftertaste will organize the rest.",
  className,
  helperText = "Drop a source in. Metadata, signal analysis, and vault filing happen after capture.",
  collectionOptions = [],
  selectedCollection = null,
  onCollectionChange,
}: PromptInputBoxProps): React.JSX.Element {
  const [input, setInput] = React.useState("");
  const [files, setFiles] = React.useState<FilePreview[]>([]);
  const [pastedSnippets, setPastedSnippets] = React.useState<PastedSnippet[]>([]);
  const [selectedImage, setSelectedImage] = React.useState<string | null>(null);
  const [collectionValue, setCollectionValue] = React.useState(selectedCollection ?? "");
  const [isRecording, setIsRecording] = React.useState(false);
  const [recordingSeconds, setRecordingSeconds] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const uploadInputRef = React.useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const mediaStreamRef = React.useRef<MediaStream | null>(null);
  const recordingChunksRef = React.useRef<Blob[]>([]);
  const recordingTimerRef = React.useRef<number | null>(null);
  const dragDepthRef = React.useRef(0);
  const filesRef = React.useRef<FilePreview[]>([]);

  React.useEffect(() => {
    setCollectionValue(selectedCollection ?? "");
  }, [selectedCollection]);

  React.useEffect(() => {
    filesRef.current = files;
  }, [files]);

  React.useEffect(() => {
    return () => {
      filesRef.current.forEach((entry) => {
        if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      });
    };
  }, []);

  const stopRecordingTimer = React.useCallback(() => {
    if (recordingTimerRef.current != null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const stopRecordingStream = React.useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  React.useEffect(() => {
    return () => {
      stopRecordingTimer();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      stopRecordingStream();
    };
  }, [stopRecordingStream, stopRecordingTimer]);

  const attachFiles = React.useCallback((incoming: File[]) => {
    if (incoming.length === 0) return;
    let appendedEntries: FilePreview[] = [];
    setFiles((current) => {
      const seenKeys = new Set(
        current.map((entry) => `${entry.file.name}:${entry.file.size}:${entry.file.lastModified}`),
      );
      const uniqueIncoming = incoming.filter((file) => {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      });
      const availableSlots = Math.max(MAX_ATTACHMENTS - current.length, 0);
      appendedEntries = uniqueIncoming.slice(0, availableSlots).map((file) => ({
        id: createClientId(),
        file,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
        textPreview: null,
      }));
      return [...current, ...appendedEntries];
    });
    appendedEntries.forEach((entry) => {
      void readTextPreview(entry.file)
        .then((textPreview) => {
          if (!textPreview) return;
          setFiles((current) =>
            current.map((candidate) =>
              candidate.id === entry.id ? { ...candidate, textPreview } : candidate,
            ),
          );
        })
        .catch(() => {
          // Preview generation is best-effort only.
        });
    });
  }, []);

  const handlePaste = React.useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(event.clipboardData.items ?? []);
    const pastedFiles = items
      .map((item) => item.getAsFile())
      .filter((file): file is File => file instanceof File);
    if (pastedFiles.length > 0) {
      event.preventDefault();
      attachFiles(pastedFiles);
      return;
    }
    const pastedText = event.clipboardData.getData("text").trim();
    if (
      pastedText.length <= PASTE_PREVIEW_THRESHOLD ||
      pastedSnippets.length >= MAX_PASTED_SNIPPETS
    ) {
      return;
    }
    event.preventDefault();
    setPastedSnippets((current) => [
      ...current,
      {
        id: createClientId(),
        content: pastedText,
        wordCount: pastedText.split(/\s+/).filter(Boolean).length,
      },
    ]);
  }, [attachFiles, pastedSnippets.length]);

  const removeFile = React.useCallback((id: string) => {
    setFiles((current) => {
      const next = [...current];
      const index = next.findIndex((entry) => entry.id === id);
      if (index === -1) return current;
      const [removed] = next.splice(index, 1);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  }, []);

  const removePastedSnippet = React.useCallback((id: string) => {
    setPastedSnippets((current) => current.filter((snippet) => snippet.id !== id));
  }, []);

  const startRecording = React.useCallback(async () => {
    if (isRecording || typeof window === "undefined") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      recordingChunksRef.current = [];
      const mimeType =
        [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/mp4",
          "audio/ogg;codecs=opus",
        ].find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        const chunks = recordingChunksRef.current;
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
          const file = new File([blob], `voice-note-${Date.now()}.${extension}`, {
            type: blob.type || "audio/webm",
          });
          attachFiles([file]);
        }
        recordingChunksRef.current = [];
        stopRecordingStream();
      });
      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      stopRecordingTimer();
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((current) => current + 1);
      }, 1000);
    } catch {
      stopRecordingStream();
      stopRecordingTimer();
      setIsRecording(false);
      setRecordingSeconds(0);
    }
  }, [attachFiles, isRecording, stopRecordingStream, stopRecordingTimer]);

  const stopRecording = React.useCallback(() => {
    stopRecordingTimer();
    setIsRecording(false);
    setRecordingSeconds(0);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    } else {
      stopRecordingStream();
    }
  }, [stopRecordingStream, stopRecordingTimer]);

  const handleSubmit = React.useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed && files.length === 0 && pastedSnippets.length === 0) return;
    onSend({
      message: trimmed,
      files: files.map((entry) => entry.file),
      collection: collectionValue.trim() ? collectionValue : null,
      pastedContents: pastedSnippets.map((snippet) => snippet.content),
    });
    setInput("");
    setSelectedImage(null);
    setFiles((current) => {
      current.forEach((entry) => {
        if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      });
      return [];
    });
    setPastedSnippets([]);
  }, [collectionValue, files, input, onSend, pastedSnippets]);

  const hasContent = input.trim().length > 0 || files.length > 0 || pastedSnippets.length > 0;
  const supportsVoiceCapture =
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;
  const formattedRecordingTime = `${String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:${String(recordingSeconds % 60).padStart(2, "0")}`;

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn(
          "relative overflow-hidden rounded-[32px] border border-[color:var(--line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(250,246,241,0.94))] p-3 shadow-[0_28px_80px_rgba(48,59,77,0.12)] backdrop-blur-xl",
          className,
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepthRef.current += 1;
          setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepthRef.current = Math.max(dragDepthRef.current - 1, 0);
          if (dragDepthRef.current === 0) setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepthRef.current = 0;
          setIsDragging(false);
          attachFiles(Array.from(event.dataTransfer.files ?? []));
        }}
      >
        {isDragging ? (
          <div className="pointer-events-none absolute inset-3 z-10 flex flex-col items-center justify-center rounded-[28px] border-2 border-dashed border-[rgba(216,153,82,0.45)] bg-[rgba(250,246,240,0.82)] text-center shadow-[inset_0_0_0_1px_rgba(255,255,255,0.4)]">
            <UploadCloud className="mb-3 h-6 w-6 text-[color:var(--accent)]" />
            <div className="text-sm font-medium text-[color:var(--ink)]">Drop files to add them to this capture</div>
            <div className="mt-1 text-xs text-[color:var(--ink-faint)]">Screenshots, docs, audio notes, or media all work here.</div>
          </div>
        ) : null}

        <div className="mb-3 flex items-start justify-between gap-3 px-1 pt-1">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--ink-faint)]">
              <Sparkles className="h-3.5 w-3.5 text-[color:var(--accent)]" />
              AI Capture
            </div>
            <p className="m-0 max-w-[54ch] text-sm leading-6 text-[color:var(--ink-soft)]">
              {helperText}
            </p>
          </div>
          <div className="rounded-full border border-[rgba(245,215,168,0.8)] bg-[rgba(245,215,168,0.28)] px-3 py-1 text-xs font-medium text-[color:var(--ink-soft)]">
            {isLoading ? "Organizing..." : "Local-first"}
          </div>
        </div>

        {pastedSnippets.length > 0 || files.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {pastedSnippets.map((snippet) => (
              <div
                key={snippet.id}
                className="group relative min-h-28 min-w-[12rem] max-w-[15rem] overflow-hidden rounded-[22px] border border-[color:var(--line)] bg-[rgba(255,255,255,0.88)] p-3"
              >
                <div className="max-h-24 overflow-hidden whitespace-pre-wrap text-[11px] leading-5 text-[color:var(--ink-soft)]">
                  {snippet.content}
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[rgba(250,246,241,0.98)] to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
                  <div>
                    <div className="inline-flex rounded-full border border-[rgba(68,83,101,0.12)] bg-[rgba(255,255,255,0.95)] px-2 py-1 text-[10px] font-semibold tracking-[0.16em] text-[color:var(--ink-soft)]">
                      PASTED
                    </div>
                    <div className="mt-1 text-[11px] text-[color:var(--ink-faint)]">{snippet.wordCount} words</div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[rgba(39,51,67,0.08)] bg-[rgba(255,255,255,0.94)] text-[color:var(--ink-soft)] shadow-sm transition hover:text-[color:var(--ink)]"
                      onClick={() => void navigator.clipboard.writeText(snippet.content)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span className="sr-only">Copy pasted text</span>
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[rgba(39,51,67,0.08)] bg-[rgba(255,255,255,0.94)] text-[color:var(--ink-soft)] shadow-sm transition hover:text-[color:var(--ink)]"
                      onClick={() => removePastedSnippet(snippet.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                      <span className="sr-only">Remove pasted text</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {files.map((entry) => (
              <div
                key={entry.id}
                className="group relative min-h-28 min-w-[12rem] max-w-[15rem] overflow-hidden rounded-[22px] border border-[color:var(--line)] bg-[rgba(255,255,255,0.88)]"
              >
                {entry.previewUrl ? (
                  <button
                    type="button"
                    className="block h-28 w-full overflow-hidden"
                    onClick={() => setSelectedImage(entry.previewUrl)}
                  >
                    <img
                      src={entry.previewUrl}
                      alt={entry.file.name}
                      className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
                    />
                  </button>
                ) : (
                  <div className="flex min-h-28 flex-col justify-between gap-3 p-3">
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 text-[color:var(--ink-soft)]">
                        {getFileIcon(entry.file)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-[color:var(--ink)]">
                          {entry.file.name}
                        </div>
                        <div className="text-xs text-[color:var(--ink-faint)]">
                          {formatFileSize(entry.file.size)}
                        </div>
                      </div>
                    </div>
                    {entry.textPreview ? (
                      <div className="max-h-16 overflow-hidden whitespace-pre-wrap text-[11px] leading-5 text-[color:var(--ink-soft)]">
                        {entry.textPreview}
                      </div>
                    ) : null}
                  </div>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[rgba(250,246,241,0.98)] to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
                  <div className="inline-flex rounded-full border border-[rgba(68,83,101,0.12)] bg-[rgba(255,255,255,0.95)] px-2 py-1 text-[10px] font-semibold tracking-[0.16em] text-[color:var(--ink-soft)]">
                    {getFileBadge(entry.file)}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                    {entry.textPreview ? (
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[rgba(39,51,67,0.08)] bg-[rgba(255,255,255,0.94)] text-[color:var(--ink-soft)] shadow-sm transition hover:text-[color:var(--ink)]"
                        onClick={() => void navigator.clipboard.writeText(entry.textPreview ?? "")}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        <span className="sr-only">Copy file preview</span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[rgba(39,51,67,0.08)] bg-[rgba(255,255,255,0.94)] text-[color:var(--ink-soft)] shadow-sm transition hover:text-[color:var(--ink)]"
                      onClick={() => removeFile(entry.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                      <span className="sr-only">Remove file</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="rounded-[28px] border border-[rgba(68,83,101,0.08)] bg-[rgba(255,255,255,0.64)] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
          {isRecording ? (
            <div className="flex min-h-28 flex-col justify-center gap-4 py-2">
              <div className="flex items-center gap-3 text-sm text-[color:var(--ink-soft)]">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[color:#d05a3e] animate-pulse" />
                <span className="font-medium text-[color:var(--ink)]">Recording voice note</span>
                <span className="font-mono text-xs tracking-[0.18em] text-[color:var(--ink-faint)]">{formattedRecordingTime}</span>
              </div>
              <div className="flex h-12 items-end gap-1">
                {Array.from({ length: 24 }).map((_, index) => (
                  <span
                    key={index}
                    className="block w-1 rounded-full bg-[linear-gradient(180deg,var(--gold),var(--rose))] opacity-80 animate-pulse"
                    style={{
                      height: `${18 + ((index * 17) % 56)}%`,
                      animationDelay: `${index * 80}ms`,
                      animationDuration: `${800 + (index % 5) * 120}ms`,
                    }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <PromptTextarea
              value={input}
              placeholder={placeholder}
              disabled={isLoading}
              onChange={(event) => setInput(event.target.value)}
              onPaste={handlePaste}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSubmit();
                }
              }}
            />
          )}

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--line)] bg-[rgba(255,255,255,0.86)] text-[color:var(--ink-soft)] transition hover:border-[color:var(--line-strong)] hover:text-[color:var(--ink)]"
                    onClick={() => uploadInputRef.current?.click()}
                    disabled={isLoading || isRecording}
                  >
                    <Paperclip className="h-4 w-4" />
                    <span className="sr-only">Attach files</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>Attach screenshots, audio, or docs</TooltipContent>
              </Tooltip>

              <label className="inline-flex max-w-full items-center gap-2 rounded-full border border-[color:var(--line)] bg-[rgba(255,255,255,0.86)] px-3 py-2 text-sm text-[color:var(--ink-soft)] transition hover:border-[color:var(--line-strong)]">
                <FolderOpen className="h-4 w-4 shrink-0" />
                <span className="shrink-0">Folder</span>
                <select
                  className="max-w-40 bg-transparent pr-6 text-[color:var(--ink)] outline-none"
                  value={collectionValue}
                  disabled={isLoading || isRecording}
                  onChange={(event) => {
                    const value = event.target.value;
                    setCollectionValue(value);
                    onCollectionChange?.(value || null);
                  }}
                >
                  <option value="">Auto-organize</option>
                  {collectionOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <input
                ref={uploadInputRef}
                type="file"
                className="hidden"
                multiple
                disabled={isLoading || isRecording}
                onChange={(event) => {
                  attachFiles(Array.from(event.target.files ?? []));
                  event.currentTarget.value = "";
                }}
              />
            </div>

            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <div className="text-xs leading-5 text-[color:var(--ink-faint)]">
                {isRecording
                  ? "Tap again to stop and attach the voice note."
                  : `Enter to capture, Shift+Enter for a new line, up to ${MAX_ATTACHMENTS} attachments.`}
              </div>
              <button
                type="button"
                className={cn(
                  "inline-flex h-11 w-11 items-center justify-center rounded-full border transition",
                  isRecording
                    ? "border-transparent bg-[rgba(208,90,62,0.14)] text-[color:#d05a3e] shadow-[0_16px_32px_rgba(208,90,62,0.18)]"
                    : hasContent
                    ? "border-transparent bg-[linear-gradient(135deg,var(--gold),var(--rose))] text-[color:var(--ink)] shadow-[0_16px_32px_rgba(245,215,168,0.42)]"
                    : "border-[color:var(--line)] bg-[rgba(255,255,255,0.86)] text-[color:var(--ink-faint)]",
                )}
                disabled={isLoading || (!hasContent && !isRecording && !supportsVoiceCapture)}
                onClick={() => {
                  if (isRecording) {
                    stopRecording();
                    return;
                  }
                  if (hasContent) {
                    handleSubmit();
                    return;
                  }
                  void startRecording();
                }}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isRecording ? (
                  <StopCircle className="h-4 w-4" />
                ) : hasContent ? (
                  <ArrowUp className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
                <span className="sr-only">Capture</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(selectedImage)} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="p-3">
          {selectedImage ? (
            <img
              src={selectedImage}
              alt="Attachment preview"
              className="max-h-[80vh] w-full rounded-[24px] object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
