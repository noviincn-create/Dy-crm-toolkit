/** Content-script side of the quick-session messages (chrome.runtime → service worker). */
import type { BgError, BgRequest } from "../shared/messages";
import type { QuickOp, QuickPayloads, QuickResponse, QuickResults } from "./protocol";

export async function quickCall<K extends QuickOp>(op: K, payload?: QuickPayloads[K]): Promise<QuickResults[K]> {
  let res: QuickResponse<K> | BgError | undefined;
  try {
    res = (await chrome.runtime.sendMessage({ type: "quick", req: { op, ...(payload as object | undefined) } } satisfies BgRequest)) as QuickResponse<K> | BgError | undefined;
  } catch {
    throw new Error("ارتباط با افزونه قطع شد؛ این صفحه را یک بار تازه‌سازی (F5) کنید.");
  }
  if (!res) throw new Error("افزونه پاسخ نداد؛ دوباره تلاش کنید.");
  if ("error" in res) throw new Error(res.error);
  if (!res.ok) throw new Error(res.message);
  return res.data;
}
