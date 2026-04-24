import type { ReactNode } from "react";

interface NudgeCardProps {
  number: string;
  date: string;
  title: string;
  subtitle: string;
  tags: string[];
  variant?: "default" | "accent" | "dark";
  linkText?: string;
  onLinkClick?: () => void;
  children?: ReactNode;
}

const variantStyles = {
  default: {
    bg: "#fff",
    title: "#111",
    num: "#111",
    date: "#555",
    sub: "#555",
    dot: "#111",
    link: "#111",
    tagBg: "#111",
    tagText: "#fff",
  },
  accent: {
    bg: "#FF5500",
    title: "#3d1500",
    num: "#3d1500",
    date: "#3d1500",
    sub: "#3d1500",
    dot: "#3d1500",
    link: "#3d1500",
    tagBg: "#3d1500",
    tagText: "#FF5500",
  },
  dark: {
    bg: "#111",
    title: "#fff",
    num: "#aaa",
    date: "#aaa",
    sub: "#aaa",
    dot: "#aaa",
    link: "#fff",
    tagBg: "#fff",
    tagText: "#111",
  },
} as const;

export default function NudgeCard({
  number,
  date,
  title,
  subtitle,
  tags,
  variant = "default",
  linkText,
  onLinkClick,
  children,
}: NudgeCardProps) {
  const v = variantStyles[variant];

  return (
    <div
      className="flex overflow-hidden cursor-pointer"
      style={{
        minHeight: 400,
        borderBottom: "1px solid var(--divider, #e0e0e0)",
        backgroundColor: v.bg,
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      {/* Left: 48% */}
      <div
        className="flex flex-col justify-between"
        style={{ flex: "0 0 48%", padding: "36px 44px" }}
      >
        <div>
          {/* Project number */}
          <div
            className="flex items-center gap-1.5"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: v.num,
              marginBottom: 28,
            }}
          >
            {number}
          </div>

          {/* Date */}
          <div
            className="flex items-center gap-2"
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: v.date,
              marginBottom: 12,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: v.dot,
                display: "inline-block",
              }}
            />
            {date}
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: 48,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              color: v.title,
              marginBottom: 14,
            }}
          >
            {title}
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: 15,
              fontWeight: 400,
              lineHeight: 1.6,
              color: v.sub,
              marginBottom: 24,
            }}
          >
            {subtitle}
          </div>

          {/* Link */}
          {linkText && (
            <div
              onClick={onLinkClick}
              className="flex items-center gap-1 cursor-pointer"
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                textDecoration: "underline",
                color: v.link,
              }}
            >
              {linkText}
            </div>
          )}
        </div>

        {/* Tags */}
        <div className="flex gap-2 flex-wrap">
          {tags.map((tag) => (
            <span
              key={tag}
              style={{
                background: v.tagBg,
                color: v.tagText,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
                padding: "7px 14px",
                textTransform: "uppercase",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Right: flex 1 */}
      <div className="relative overflow-hidden flex items-center justify-center" style={{ flex: 1 }}>
        {children}
      </div>
    </div>
  );
}
