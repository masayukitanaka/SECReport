import { useEffect, useState } from "react";

/** startedAt（Date.now()のタイムスタンプ）からの経過秒数を0.1秒単位で返す。active が false の間は更新を止める。 */
export function useElapsed(startedAt: number | null, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [active]);

  if (startedAt === null) return 0;
  return Math.max(0, (now - startedAt) / 1000);
}
