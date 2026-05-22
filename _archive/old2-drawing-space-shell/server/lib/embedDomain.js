import { normalizeHost } from "./sameOrigin.js";

export function requestOriginHost(req) {
  const origin = req.get("origin") || req.get("referer") || "";
  try {
    return normalizeHost(new URL(origin).hostname);
  } catch {
    return "";
  }
}

export function isDomainAllowed(allowedDomains, req) {
  if (!allowedDomains || allowedDomains.trim() === "*") return true;
  const host = requestOriginHost(req) || normalizeHost(req.get("host") || "");
  const allowed = allowedDomains
    .split(",")
    .map((item) => normalizeHost(item))
    .filter(Boolean);
  return allowed.some((domain) => host === domain || host.endsWith(`.${domain}`));
}
