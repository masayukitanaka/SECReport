// 過去の質問履歴（左メニューでの表示、docs_jp/tasks.md参照）。
// user_id は Auth0 の user.sub をクライアントがそのまま申告する。バックエンドAPIのJWT検証は
// 未実装のため、現状は申告された user_id を信頼する設計（docs_jp/tasks.md参照）。

export interface QuestionHistoryEntry {
  id: string;
  question: string;
  filterJson: string | null;
  responseJson: string;
  createdAt: string;
}

export interface QuestionHistorySummary {
  id: string;
  question: string;
  createdAt: string;
  refused: boolean;
}

export async function recordQuestionHistory(
  env: Env,
  userId: string,
  question: string,
  filter: unknown,
  response: unknown,
): Promise<void> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO question_history (id, user_id, question, filter_json, response_json) VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(id, userId, question, filter ? JSON.stringify(filter) : null, JSON.stringify(response))
    .run();
}

/** 左メニュー等での一覧表示用。概要のみ（質問文・日時・拒否有無）を返す。 */
export async function listQuestionHistorySummaries(
  env: Env,
  userId: string,
  limit = 50,
): Promise<QuestionHistorySummary[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, question, created_at as createdAt, response_json as responseJson
     FROM question_history WHERE user_id = ?1 ORDER BY created_at DESC LIMIT ?2`,
  )
    .bind(userId, limit)
    .all<{ id: string; question: string; createdAt: string; responseJson: string }>();

  return results.map((row) => {
    let refused = false;
    try {
      refused = Boolean((JSON.parse(row.responseJson) as { refused?: boolean }).refused);
    } catch {
      // レスポンスJSONが壊れている場合はrefused=falseのまま扱う
    }
    return { id: row.id, question: row.question, createdAt: row.createdAt, refused };
  });
}

export async function getQuestionHistoryEntry(
  env: Env,
  userId: string,
  id: string,
): Promise<QuestionHistoryEntry | null> {
  const row = await env.DB.prepare(
    `SELECT id, question, filter_json as filterJson, response_json as responseJson, created_at as createdAt
     FROM question_history WHERE user_id = ?1 AND id = ?2`,
  )
    .bind(userId, id)
    .first<QuestionHistoryEntry>();
  return row ?? null;
}

export async function deleteQuestionHistoryEntry(env: Env, userId: string, id: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM question_history WHERE user_id = ?1 AND id = ?2`).bind(userId, id).run();
}
