import { useEffect, useRef, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
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

function initials(name: string | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const chars = parts.length >= 2 ? [parts[0][0], parts[1][0]] : [name[0]];
  return chars.join("").toUpperCase();
}

function AccountArea() {
  const { isAuthenticated, isLoading, user, loginWithRedirect, logout } = useAuth0();
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

  if (isLoading) return null;

  if (!isAuthenticated) {
    return (
      <button
        onClick={() => loginWithRedirect()}
        style={{
          padding: "7px 16px",
          border: "1px solid var(--accent)",
          borderRadius: 4,
          color: "var(--accent-deep)",
          fontSize: 13,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover-bg)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        ログイン
      </button>
    );
  }

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
            overflow: "hidden",
          }}
        >
          {user?.picture ? (
            <img src={user.picture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            initials(user?.name)
          )}
        </span>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--text)" }}>
          {user?.name ?? user?.email}
        </span>
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
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 13.5, fontWeight: 500 }}>{user?.name}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>{user?.email}</span>
          </div>
          <MenuItem icon={<Settings size={15} color="currentColor" />}>設定</MenuItem>
          <MenuItem
            icon={<LogOut size={15} color="currentColor" />}
            danger
            onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
          >
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

function MenuItem({
  icon,
  danger,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  danger?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
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
