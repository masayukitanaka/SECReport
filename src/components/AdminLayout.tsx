import { Link, Outlet, useLocation } from "react-router-dom";
import { Tag } from "./Tag";

export function AdminLayout() {
  const location = useLocation();

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          padding: "0 40px",
          height: 48,
          borderBottom: "1px solid var(--border)",
          maxWidth: 1320,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <AdminTabLink to="/admin/eval" active={location.pathname.startsWith("/admin/eval")}>
          評価結果
        </AdminTabLink>
        <AdminTabLink to="/admin/ticker" active={location.pathname.startsWith("/admin/ticker")}>
          ティッカー管理
        </AdminTabLink>
        <Tag color="blue" style={{ fontSize: 10, padding: "2px 6px", marginLeft: "auto" }}>
          開発者向け
        </Tag>
      </nav>
      <Outlet />
    </div>
  );
}

function AdminTabLink({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      style={{
        display: "flex",
        alignItems: "center",
        height: "100%",
        fontSize: 13,
        borderBottom: active ? "1px solid var(--text)" : "1px solid transparent",
        color: active ? "var(--text)" : "var(--muted)",
        textDecoration: "none",
      }}
    >
      {children}
    </Link>
  );
}
