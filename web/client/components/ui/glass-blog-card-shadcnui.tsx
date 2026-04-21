import { Avatar, AvatarFallback, AvatarImage } from "./avatar.js";
import { Badge } from "./badge.js";
import { Card } from "./card.js";
import { cn } from "../../lib/utils.js";
import { motion } from "framer-motion";
import { BookOpen, Clock } from "lucide-react";

interface GlassBlogCardProps {
  title?: string;
  excerpt?: string;
  image?: string;
  author?: {
    name: string;
    avatar: string;
  };
  date?: string;
  readTime?: string;
  tags?: string[];
  className?: string;
  actionLabel?: string;
  onAction?: () => void;
  onOpen?: () => void;
}

const defaultPost = {
  title: "The Future of UI Design",
  excerpt:
    "Exploring the latest trends in glassmorphism, 3D elements, and micro-interactions.",
  image:
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80",
  author: {
    name: "Moumen Soliman",
    avatar: "https://github.com/shadcn.png",
  },
  date: "Dec 2, 2025",
  readTime: "5 min read",
  tags: ["Design", "UI/UX"],
};

export function GlassBlogCard({
  title = defaultPost.title,
  excerpt = defaultPost.excerpt,
  image = defaultPost.image,
  author = defaultPost.author,
  date = defaultPost.date,
  readTime = defaultPost.readTime,
  tags = defaultPost.tags,
  className,
  actionLabel = "Read Article",
  onAction,
  onOpen,
}: GlassBlogCardProps) {
  const initial = author.name.trim().charAt(0).toUpperCase() || "A";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn("w-full max-w-[400px]", className)}
    >
      <Card
        className={cn(
          "group relative h-full overflow-hidden rounded-[28px] border-[rgba(255,255,255,0.62)] bg-[rgba(255,255,255,0.34)] shadow-[0_18px_46px_rgba(48,59,77,0.08)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-[rgba(39,51,67,0.14)] hover:shadow-[0_26px_70px_rgba(48,59,77,0.14)]",
          onOpen ? "cursor-pointer" : "",
        )}
        onClick={onOpen}
        onKeyDown={
          onOpen
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpen();
                }
              }
            : undefined
        }
        role={onOpen ? "button" : undefined}
        tabIndex={onOpen ? 0 : undefined}
      >
        <div className="relative aspect-[16/9] overflow-hidden">
          <motion.img
            src={image}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[rgba(26,34,48,0.72)] via-transparent to-transparent opacity-70 transition-opacity duration-300 group-hover:opacity-40" />

          <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
            {tags?.map((tag, index) => (
              <Badge
                key={index}
                variant="secondary"
                className="bg-[rgba(255,255,255,0.28)] text-white backdrop-blur-sm"
              >
                {tag}
              </Badge>
            ))}
          </div>

          <div className="absolute inset-0 flex items-center justify-center bg-[rgba(248,244,238,0.18)] backdrop-blur-[2px] opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 rounded-full bg-[rgba(39,51,67,0.94)] px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-[rgba(39,51,67,0.18)]"
              onClick={(event) => {
                event.stopPropagation();
                onAction?.();
              }}
            >
              <BookOpen className="h-4 w-4" />
              {actionLabel}
            </motion.button>
          </div>
        </div>

        <div className="flex flex-col gap-4 p-5">
          <div className="space-y-2">
            <h3 className="text-xl font-semibold leading-tight tracking-tight text-[var(--ink)] transition-colors group-hover:text-[rgba(39,51,67,0.94)]">
              {title}
            </h3>
            <p className="line-clamp-2 text-sm text-[var(--ink-soft)]">
              {excerpt}
            </p>
          </div>

          <div className="flex items-center justify-between border-t border-[rgba(68,83,101,0.1)] pt-4">
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8 border border-[rgba(68,83,101,0.08)]">
                {author.avatar ? <AvatarImage src={author.avatar} alt={author.name} /> : null}
                <AvatarFallback>{initial}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col text-xs">
                <span className="font-medium text-[var(--ink)]">
                  {author.name}
                </span>
                <span className="text-[var(--ink-faint)]">{date}</span>
              </div>
            </div>

            <div className="flex items-center gap-1 text-xs text-[var(--ink-faint)]">
              <Clock className="h-3 w-3" />
              <span>{readTime}</span>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
