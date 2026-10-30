import type { CSSProperties } from "react";

// Lucide (https://lucide.dev) 準拠の最小実装。design_handoff_filing_qa の Filing QA.dc.html から
// 使用アイコンのパスをそのまま移植している。stroke-width は 1.6〜1.75（デザイン仕様どおり）。

interface IconProps {
  size?: number;
  color?: string;
  style?: CSSProperties;
}

function Icon({
  size = 16,
  color = "currentColor",
  strokeWidth = 1.75,
  style,
  children,
}: IconProps & { strokeWidth?: number; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      {children}
    </svg>
  );
}

export function CircleAlert(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={1.75}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </Icon>
  );
}

export function TriangleAlert(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={1.6}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </Icon>
  );
}

export function CircleX(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={1.75}>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </Icon>
  );
}

export function ExternalLink(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={1.75}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </Icon>
  );
}

export function ChevronDown(props: IconProps & { rotateDeg?: number }) {
  const { rotateDeg = 0, style, ...rest } = props;
  return (
    <Icon {...rest} strokeWidth={1.75} style={{ transform: `rotate(${rotateDeg}deg)`, transition: "transform .15s ease", ...style }}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function ArrowUp(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={1.75}>
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </Icon>
  );
}

export function Play(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={1.75}>
      <polygon points="6 3 20 12 6 21 6 3" />
    </Icon>
  );
}

export function Settings(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={1.6}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

export function LogOut(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={1.6}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </Icon>
  );
}
