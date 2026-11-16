// "Where did I come from?" helpers shared by the list pages (which add `from=` to their document links) and BackButton (which follows it).
// Only a page of this portal is accepted, so the link can never send someone to another site.
export const safeFrom = (p) => (typeof p === 'string' && /^\/admin(?:[/?#][^\s]*)?$/.test(p) && !p.includes('//') ? p : null);
// `?from=...` for a link to a document, or '' when the path is not a page of this portal
export const fromQuery = (path) => (safeFrom(path) ? `from=${encodeURIComponent(path)}` : '');
