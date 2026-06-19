/** @param {number} n @param {number} [width] */
function pad(n, width = 2) {
  return String(n).padStart(width, "0");
}

/** Local wall-clock timestamp for log lines (respects process TZ). */
export function formatLogTimestamp(date = new Date()) {
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  const ms = pad(date.getMilliseconds(), 3);
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const oh = pad(Math.floor(abs / 60));
  const om = pad(abs % 60);
  return `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}${sign}${oh}:${om}`;
}

/** Session id + log basename stamp: YYYYMMDD-HHMMSS (local time, no pid). */
export function createLogSessionId(date = new Date()) {
  return (
    [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("") +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** @param {"server" | "client" | "merged"} kind */
export function sessionLogBasename(kind, sessionId) {
  return `${kind}-${sessionId}.log`;
}
