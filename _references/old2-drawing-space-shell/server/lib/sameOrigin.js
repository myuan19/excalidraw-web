export function normalizeHost(value) {
  return String(value || "").trim().toLowerCase();
}

export function getOriginHost(req) {
  const origin = req.get("origin");
  if (!origin) return "";
  try {
    return normalizeHost(new URL(origin).host);
  } catch {
    return "";
  }
}

export function isSameOriginRequest(req) {
  const originHost = getOriginHost(req);
  if (!originHost) return true;
  const requestHost = normalizeHost(req.get("host"));
  return !!requestHost && originHost === requestHost;
}

export function requireSameOrigin(req, res, next) {
  if (!isSameOriginRequest(req)) {
    return res.status(403).json({ error: "same_origin_required" });
  }
  next();
}
