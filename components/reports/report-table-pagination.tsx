"use client"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type ReportTablePaginationProps = {
  title: string
  totalRows: number
  pageStartRow: number
  pageEndRow: number
  page: number
  totalPages: number
  pageSize: number
  onPageSizeChange: (size: number) => void
  onPageChange: (page: number) => void
  loading?: boolean
  rowLabel?: string
}

export function ReportTablePaginationHeader({
  title,
  totalRows,
  pageStartRow,
  pageEndRow,
  pageSize,
  onPageSizeChange,
  loading = false,
  rowLabel = "records",
}: Omit<ReportTablePaginationProps, "page" | "totalPages" | "onPageChange">) {
  return (
    <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-slate-50 border-b border-gray-200">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
          <div>
            {loading
              ? "Loading…"
              : totalRows > 0
                ? `Showing ${pageStartRow}-${pageEndRow} of ${totalRows.toLocaleString()} ${rowLabel}`
                : `No ${rowLabel}`}
          </div>
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <Select
              value={String(pageSize)}
              disabled={loading}
              onValueChange={(v) => onPageSizeChange(parseInt(v, 10))}
            >
              <SelectTrigger className="h-8 w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ReportTablePaginationFooter({
  totalRows,
  page,
  totalPages,
  onPageChange,
  loading = false,
  rowLabel = "records",
}: Pick<
  ReportTablePaginationProps,
  "totalRows" | "page" | "totalPages" | "onPageChange" | "loading" | "rowLabel"
>) {
  if (totalRows === 0) return null

  return (
    <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-200">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          {totalRows.toLocaleString()} {rowLabel}
          {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ""}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1 || loading}
              className="h-9 px-4 border-gray-200 hover:border-gray-300"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages || loading}
              className="h-9 px-4 border-gray-200 hover:border-gray-300"
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
