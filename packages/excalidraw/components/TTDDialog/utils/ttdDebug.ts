/**
 * TTD 调试日志（仅 console，不改变业务逻辑）。
 * 开启：开发模式 / VITE_APP_DEPLOY_DEBUG / localStorage excalidraw-ttd-debug=1
 */
export function isTtdDebugEnabled(): boolean {
  try {
    if (typeof localStorage !== "undefined") {
      if (localStorage.getItem("excalidraw-ttd-debug") === "0") {
        return false;
      }
      if (localStorage.getItem("excalidraw-ttd-debug") === "1") {
        return true;
      }
    }
  } catch {
    /* no localStorage */
  }

  const env = import.meta.env;
  if (env.DEV) {
    return true;
  }
  if (env.VITE_APP_DEPLOY_DEBUG === "true") {
    return true;
  }
  return false;
}

export function ttdDebug(
  label: string,
  data?: Record<string, unknown>,
): void {
  if (!isTtdDebugEnabled()) {
    return;
  }
  const prefix = `[DEBUG] ttd | ${label}`;
  if (data === undefined) {
    console.log(prefix);
    return;
  }
  try {
    console.log(prefix, data);
  } catch {
    console.log(prefix);
  }
}

/** 仅用于日志：根据最新用户输入粗判语言倾向 */
export function guessUserLanguageHint(
  text: string,
): "zh" | "en" | "mixed" | "empty" {
  const trimmed = text.trim();
  if (!trimmed) {
    return "empty";
  }
  const hasCjk = /[\u4e00-\u9fff]/.test(trimmed);
  const hasLatin = /[a-zA-Z]/.test(trimmed);
  if (hasCjk && !hasLatin) {
    return "zh";
  }
  if (hasLatin && !hasCjk) {
    return "en";
  }
  return "mixed";
}

/** 仅用于日志：回复是否更像英文 */
export function responseLooksEnglish(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  const latin = (trimmed.match(/[a-zA-Z]/g) || []).length;
  const cjk = (trimmed.match(/[\u4e00-\u9fff]/g) || []).length;
  return latin > 0 && latin >= cjk * 2;
}
