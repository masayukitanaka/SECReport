// バックエンドAPIのJWT検証（docs_jp/tasks.md P0参照）。
// Auth0が発行するRS256 JWT（access token）を、Auth0のJWKS（公開鍵セット）で検証する。
// jwtVerify に渡す JWKS は createRemoteJWKSet でキャッシュされ、Workers のグローバルスコープ
// （コールドスタート間で再利用されることがある）に保持されるため、検証ごとの鍵取得は発生しない。
import { createRemoteJWKSet, jwtVerify } from "jose";

export interface AuthenticatedUser {
  sub: string;
}

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
  }
}

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedJwksDomain: string | null = null;

function getJwks(domain: string) {
  if (!cachedJwks || cachedJwksDomain !== domain) {
    cachedJwks = createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));
    cachedJwksDomain = domain;
  }
  return cachedJwks;
}

/**
 * Authorization: Bearer <token> ヘッダーからAuth0のaccess tokenを取り出し、
 * 署名（RS256、Auth0のJWKS）・issuer・audienceを検証する。
 * 検証成功時は `sub`（Auth0のユーザーID、user.sub相当）を返す。
 * 失敗時は UnauthorizedError を投げる（呼び出し側で401を返すこと）。
 */
export async function requireAuth(request: Request, env: Env): Promise<AuthenticatedUser> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new UnauthorizedError("Authorization: Bearer <token> ヘッダーが必要です。");
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    throw new UnauthorizedError("Authorization: Bearer <token> ヘッダーが必要です。");
  }

  const domain = env.AUTH0_DOMAIN;
  const audience = env.AUTH0_AUDIENCE;
  if (!domain || !audience) {
    // AUTH0_DOMAIN/AUTH0_AUDIENCE が未設定の環境（Auth0側のAPI作成がまだの場合）向けの
    // 明示的なエラー。「生成結果を取得できませんでした」のような曖昧なエラーにしない。
    throw new UnauthorizedError(
      "サーバー側のAuth0設定（AUTH0_DOMAIN/AUTH0_AUDIENCE）が未設定です。Workers Secretsを設定してください。",
    );
  }

  try {
    const { payload } = await jwtVerify(token, getJwks(domain), {
      issuer: `https://${domain}/`,
      audience,
    });
    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      throw new UnauthorizedError("トークンに sub（ユーザーID）が含まれていません。");
    }
    return { sub: payload.sub };
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new UnauthorizedError(`トークンの検証に失敗しました（${message}）。`);
  }
}
