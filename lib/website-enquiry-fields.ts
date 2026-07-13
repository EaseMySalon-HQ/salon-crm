export function slugifyFieldKey(label: string, fallback = 'field') {
  const base = String(label || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return base || fallback
}
