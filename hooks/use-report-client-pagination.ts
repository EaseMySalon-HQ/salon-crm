import { useEffect, useMemo, useState } from "react"

export const DEFAULT_REPORT_PAGE_SIZE = 25

export function useReportClientPagination<T>(rows: T[], resetDeps: readonly unknown[]) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_REPORT_PAGE_SIZE)

  useEffect(() => {
    setPage(1)
  }, resetDeps)

  const totalRows = rows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const paginatedRows = useMemo(
    () => rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [rows, safePage, pageSize]
  )

  const pageStartRow = totalRows === 0 ? 0 : (safePage - 1) * pageSize + 1
  const pageEndRow = totalRows === 0 ? 0 : Math.min(safePage * pageSize, totalRows)

  const handlePageSizeChange = (next: number) => {
    setPageSize(next)
    setPage(1)
  }

  return {
    page: safePage,
    setPage,
    pageSize,
    setPageSize: handlePageSizeChange,
    totalRows,
    totalPages,
    pageStartRow,
    pageEndRow,
    paginatedRows,
  }
}
