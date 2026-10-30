import { useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useNavigate } from "react-router-dom";

export function LandingPage() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading || isAuthenticated) {
    return null;
  }

  return (
    <main
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
        padding: "80px 40px",
        textAlign: "center",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 }}>
        <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 44, fontWeight: 500, lineHeight: 1.2 }}>
          SEC 10-Q の内容を、引用付きで質問できる
        </h1>
        <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.7, color: "var(--text-2)" }}>
          米国上場企業の四半期報告書（10-Q）について自然言語で質問すると、根拠となる書類の該当箇所を引用して回答します。根拠が見つからない質問には、推測せず回答を控えます。
        </p>
      </div>
      <button
        onClick={() => loginWithRedirect()}
        style={{
          padding: "12px 28px",
          border: "1px solid var(--accent)",
          borderRadius: 4,
          color: "var(--accent-deep)",
          fontSize: 15,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover-bg)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        onMouseDown={(e) => (e.currentTarget.style.background = "var(--accent-active-bg)")}
      >
        ログインして始める
      </button>
    </main>
  );
}
