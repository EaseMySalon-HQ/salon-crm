import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import * as XLSX from "xlsx"

export function buildDateRangeSubtitle(dateFrom: string, dateTo: string): string | undefined {
  const a = dateFrom?.trim()
  const b = dateTo?.trim()
  if (!a && !b) return undefined
  return `Period: ${a || "…"} → ${b || "…"}`
}

export function downloadTableXlsx(filenameBase: string, sheetName: string, headers: string[], rows: (string | number)[][]) {
  const safeName = sheetName.slice(0, 31) || "Data"
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, safeName)
  XLSX.writeFile(wb, `${filenameBase.replace(/[/\\?%*:|"<>]/g, "-")}.xlsx`)
}

export function downloadTablePdf(
  title: string,
  subtitle: string | undefined,
  filenameBase: string,
  headers: string[],
  rows: (string | number)[][],
  landscape = true
) {
  const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "mm", format: "a4" })
  let y = 10
  doc.setFontSize(14)
  doc.setTextColor(30, 30, 30)
  doc.text(title, 14, y)
  y += 7
  if (subtitle) {
    doc.setFontSize(9)
    doc.setTextColor(90, 90, 90)
    doc.text(subtitle, 14, y)
    y += 5
  }
  autoTable(doc, {
    head: [headers],
    body: rows.map((r) => r.map((c) => (c == null ? "" : String(c)))),
    startY: y + 2,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [51, 65, 85] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  })
  doc.save(`${filenameBase.replace(/[/\\?%*:|"<>]/g, "-")}.pdf`)
}
