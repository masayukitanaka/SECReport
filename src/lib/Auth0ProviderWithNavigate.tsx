import type { ReactNode } from "react";
import { Auth0Provider, type AppState } from "@auth0/auth0-react";
import { useNavigate } from "react-router-dom";

// Auth0 ログイン完了後、loginWithRedirect({ appState: { returnTo } }) で渡した
// returnTo へ react-router のナビゲーションで戻す定番パターン（Auth0 React 公式サンプル準拠）。
export function Auth0ProviderWithNavigate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  const domain = import.meta.env.VITE_AUTH0_DOMAIN;
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;

  const onRedirectCallback = (appState?: AppState) => {
    navigate(appState?.returnTo ?? "/dashboard");
  };

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
      }}
      onRedirectCallback={onRedirectCallback}
    >
      {children}
    </Auth0Provider>
  );
}
