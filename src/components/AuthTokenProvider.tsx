import { useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { setTokenGetter } from "../lib/api";

// バックエンドAPIのJWT検証（docs_jp/tasks.md P0参照）に向けて、useAuth0 の getAccessTokenSilently を
// api.ts（Reactコンポーネント外の純粋関数群）から呼べるように登録する。App.tsx のルート直下に置く。
export function AuthTokenProvider() {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();

  useEffect(() => {
    if (!isAuthenticated) {
      setTokenGetter(null);
      return;
    }
    setTokenGetter(async () => {
      const token = await getAccessTokenSilently();
      if (!token) throw new Error("アクセストークンを取得できませんでした。");
      return token;
    });
    return () => setTokenGetter(null);
  }, [isAuthenticated, getAccessTokenSilently]);

  return null;
}
