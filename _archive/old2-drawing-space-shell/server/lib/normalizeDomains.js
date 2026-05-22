export function normalizeDomains(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw === "*") return "*";
  const domains = [];
  for (const part of raw.split(",")) {
    const host = part.trim().toLowerCase().replace(/\.$/, "");
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host)) {
      return null;
    }
    if (!domains.includes(host)) domains.push(host);
  }
  return domains.length ? domains.join(",") : null;
}
