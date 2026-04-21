import { BookOpen, FileText, Globe, Image, MessageCircle, Quote, Video } from "lucide-react";

import { BentoGrid, type BentoItem } from "./bento-grid.js";

export interface SearchReferenceCardItem {
  id: string;
  title: string;
  excerpt: string;
  image: string;
  mediaType: "webpages" | "videos" | "quotes" | "x-posts" | "images" | "articles" | "notes";
  status: string;
  authorName: string;
  date: string;
  readTime: string;
  tags: string[];
  colSpan?: number;
  rowSpan?: number;
  hasPersistentHover?: boolean;
  onOpen: () => void;
  onAction: () => void;
}

interface ReferenceSearchResultsProps {
  items: SearchReferenceCardItem[];
}

function getReferenceIcon(mediaType: SearchReferenceCardItem["mediaType"]) {
  switch (mediaType) {
    case "videos":
      return <Video className="h-4 w-4 text-[var(--rose)]" />;
    case "quotes":
      return <Quote className="h-4 w-4 text-[var(--gold)]" />;
    case "x-posts":
      return <MessageCircle className="h-4 w-4 text-[var(--blue)]" />;
    case "images":
      return <Image className="h-4 w-4 text-[var(--pink)]" />;
    case "articles":
      return <FileText className="h-4 w-4 text-[var(--mint)]" />;
    case "notes":
      return <BookOpen className="h-4 w-4 text-[var(--gold)]" />;
    case "webpages":
    default:
      return <Globe className="h-4 w-4 text-[var(--blue)]" />;
  }
}

export function ReferenceSearchResults({ items }: ReferenceSearchResultsProps) {
  const bentoItems: BentoItem[] = items.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.excerpt,
    image: item.image,
    icon: getReferenceIcon(item.mediaType),
    status: item.status,
    meta: `${item.authorName} · ${item.date}`,
    footer: item.readTime,
    tags: item.tags,
    colSpan: item.colSpan,
    rowSpan: item.rowSpan,
    hasPersistentHover: item.hasPersistentHover,
    cta: "Open in studio",
    actionLabel: "Use in ideas",
    onOpen: item.onOpen,
    onAction: item.onAction,
  }));

  return (
    <BentoGrid items={bentoItems} />
  );
}
