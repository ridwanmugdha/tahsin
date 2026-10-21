/* ==========================================================================
   Tiny in-memory rate limit per IP. Each limiter keeps its own counts.
   ========================================================================== */
const tooMany = (req, res) => res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });

export function rateLimit(limit, windowMs, onLimit = tooMany) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const entry = hits.get(req.ip);
    if (!entry || entry.reset < now) hits.set(req.ip, { count: 1, reset: now + windowMs });
    else if (++entry.count > limit) return onLimit(req, res);
    next();
  };
}
