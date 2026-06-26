import { callNumEl, titleEl, dateEl } from "./dom";
import { fmtDate } from "./format";
import type { CallMeta } from "./job";

export function applyCallMeta(call?: CallMeta, fallbackTitle?: string) {
  const n = call?.number;
  callNumEl.textContent = n !== undefined && n !== "" ? `#${String(n)}` : "";
  titleEl.textContent = call?.title ?? fallbackTitle ?? "";
  dateEl.textContent = fmtDate(call?.date);
}
