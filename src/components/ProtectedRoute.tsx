import type { ReactNode } from "react";
import { useAuth0 } from "@auth0/auth0-react";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();

  if (isLoading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 64 }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 20, fontStyle: "italic", color: "var(--muted)" }}>
          読み込んでいます…
        </span>
      </div>
    );
  }

  if (!isAuthenticated) {
    loginWithRedirect({
      appState: { returnTo: window.location.pathname },
    });
    return null;
  }

  return <>{children}</>;
}
