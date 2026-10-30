import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  CircleAlert,
  LogOut,
  Settings,
} from "./icons";

export function Header() {
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--bg)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 32,
          padding: "0 40px",
          height: 64,
          borderBottom: "1px solid var(--border)",
          whiteSpace: "nowrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flex: "none" }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600, letterSpacing: ".01em" }}>
            Filing Reader
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: ".08em" }}>
            SEC 10-Q Q&amp;A
          </span>
        </div>

        <div style={{ marginLeft: "auto", flex: "none" }}>
          <AccountArea />
        </div>
      </div>

      <div
        role="note"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "9px 40px",
          borderBottom: "1px solid var(--banner-border)",
          background: "var(--banner-bg)",
          fontSize: 12.5,
          lineHeight: 1.6,
          color: "var(--banner-text)",
        }}
      >
        <CircleAlert size={15} color="var(--accent-deep)" style={{ flex: "none" }} />
        <span>
          本サービスは投資助言を目的としたものではありません。表示される内容は SEC への提出書類に基づく情報の抜粋であり、正確性・完全性を保証するものではありません。
        </span>
      </div>
    </header>
  );
}

// アカウント機能は Auth0 統合までのプレースホルダー（見た目のみ・クリックしても何も起きない）。
// docs_jp/designs.md 上の「設定」「ログアウト」は本実装では no-op。
function AccountArea() {
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menuOpen]);

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 32,
        position: "relative",
        whiteSpace: "nowrap",
      }}
    >
      <HoverIconButton title="設定" ariaLabel="設定">
        <Settings size={17} color="var(--text-2)" />
      </HoverIconButton>

      <button
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 8px 4px 4px",
          borderRadius: 4,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-neutral)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--gold-bg)",
            color: "var(--gold-fg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-sans)",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          YT
        </span>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--text)" }}>山田 太郎</span>
        <ChevronDown size={13} color="var(--muted)" />
      </button>

      {menuOpen && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: 44,
            right: 0,
            width: 240,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            boxShadow: "0 6px 20px rgba(32,31,29,.08)",
            display: "flex",
            flexDirection: "column",
            padding: 6,
            zIndex: 20,
          }}
        >
          <div
            style={{
              padding: "10px 10px 12px",
              borderBottom: "1px solid var(--border-weak)",
              marginBottom: 6,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 13.5, fontWeight: 500 }}>山田 太郎</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
              taro.yamada@example.com
            </span>
          </div>
          <MenuItem icon={<Settings size={15} color="currentColor" />}>設定</MenuItem>
          <MenuItem icon={<LogOut size={15} color="currentColor" />} danger>
            ログアウト
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function HoverIconButton({
  title,
  ariaLabel,
  children,
}: {
  title: string;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      aria-label={ariaLabel}
      style={{
        width: 36,
        height: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 4,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-neutral)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
}

function MenuItem({ icon, danger, children }: { icon: React.ReactNode; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      role="menuitem"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 10px",
        borderRadius: 3,
        fontSize: 13,
        color: danger ? "var(--error-fg, #8a3326)" : "var(--text)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = danger ? "var(--red-bg)" : "var(--hover-neutral)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {icon}
      {children}
    </button>
  );
}
