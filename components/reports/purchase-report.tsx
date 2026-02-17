"use client"

import * as React from "react"
import { Loader2, DollarSign, Receipt, PieChart } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ReportsAPI } from "@/lib/api"
import { format } from "date-fns"

const CATEGORY_LABELS: Record<string, string> = {
  hair: "Hair",
  skin: "Skin",
  nails: "Nails",
  retail: "Retail",
  other: "Other",
}

export function PurchaseReport() {
  const [data, setData] = React.useState<any>(null)
  const [loading, setLoading] = React.useState(true)
  const [dateFrom, setDateFrom] = React.useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"))
  const [dateTo, setDateTo] = React.useState(format(new Date(), "yyyy-MM-dd"))

  const loadReport = React.useCallback(async () => {
    try {
      setLoading(true)
      const res = await ReportsAPI.getPurchaseReport({ dateFrom, dateTo })
      if (res.success) setData(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo])

  React.useEffect(() => {
    loadReport()
  }, [loadReport])

  const categorySpend = data?.categorySpend || []

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex gap-4 items-end">
          <div className="space-y-2">
            <Label>From</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>To</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Purchases</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  ₹{(data?.monthlyTotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">GST Input</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  ₹{(data?.gstTotal || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Order Count</CardTitle>
                <PieChart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{data?.orderCount || 0}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Category-wise Spending</CardTitle>
              <p className="text-sm text-muted-foreground">Purchase breakdown by supplier category</p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categorySpend.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">
                        No data for the selected period
                      </TableCell>
                    </TableRow>
                  ) : (
                    categorySpend.map((row: any) => (
                      <TableRow key={row.category}>
                        <TableCell>{CATEGORY_LABELS[row.category] || row.category}</TableCell>
                        <TableCell className="text-right">
                          ₹{(row.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
