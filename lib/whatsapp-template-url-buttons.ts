/** Shared helpers for dynamic URL button sample URLs (Meta/Gupshup submit). */

export type DynamicUrlButton = {
  index: number
  text: string
  url: string
  urlExample?: string | null
  suggestedExample?: string
}

export function urlHasDynamicPlaceholder(url: string): boolean {
  return /\{\{\d+\}\}/.test(url)
}

export function suggestUrlExample(url: string): string {
  return String(url || "").replace(/\{\{\d+\}\}/g, "sample")
}

export function listDynamicUrlButtons(
  components?: { buttons?: Array<{ type: string; text?: string; url?: string | null; urlExample?: string | null }> } | null
): DynamicUrlButton[] {
  const buttons = components?.buttons
  if (!Array.isArray(buttons)) return []
  const out: DynamicUrlButton[] = []
  buttons.forEach((btn, index) => {
    if (btn?.type !== "URL") return
    const url = String(btn.url || "")
    if (!urlHasDynamicPlaceholder(url)) return
    out.push({
      index,
      text: btn.text || "",
      url,
      urlExample: btn.urlExample ?? null,
      suggestedExample: suggestUrlExample(url),
    })
  })
  return out
}

export function missingDynamicUrlExamples(
  components?: { buttons?: Array<{ type: string; text?: string; url?: string | null; urlExample?: string | null }> } | null
): DynamicUrlButton[] {
  return listDynamicUrlButtons(components).filter((b) => !String(b.urlExample || "").trim())
}

/** Build submit/import payload: { "0": "https://...", "1": "..." } */
export function urlExamplesPayload(values: Record<number, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [idx, url] of Object.entries(values)) {
    const trimmed = String(url || "").trim()
    if (trimmed) out[String(idx)] = trimmed
  }
  return out
}
