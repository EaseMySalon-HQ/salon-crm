"use client"

import * as React from "react"
import { Loader2, Users, DollarSign, Package } from "lucide-react"
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

export function SupplierReport() {
  const [data, setData] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dateFrom, setDateFrom] = React.useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"))
  const [dateTo, setDateTo] = React.useState(format(new Date(), "yyyy-MM-dd"))

  const loadReport = React.useCallback(async () => {
    try {
      setLoading(true)
      const res = await ReportsAPI.getSupplierReport({ dateFrom, dateTo })
      if (res.success) setData(res.data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo])

  React.useEffect(() => {
    loadReport()
  }, [loadReport])

  const totalPurchased = data.reduce((s, r) => s + (r.totalPurchased || 0), 0)
  const totalOutstanding = data.reduce((s, r) => s + (r.outstanding || 0), 0)

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Purchased</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">₹{totalPurchased.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Outstanding</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">
              ₹{totalOutstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Supplier Summary</CardTitle>
          <p className="text-sm text-muted-foreground">Total purchased and outstanding dues per supplier</p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Total Purchased</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Top Products</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No data for the selected period
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((item) => (
                    <TableRow key={item.supplier?._id}>
                      <TableCell className="font-medium">{item.supplier?.name || "-"}</TableCell>
                      <TableCell className="text-right">
                        ₹{(item.totalPurchased || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.outstanding > 0 ? (
                          <span className="text-amber-600 font-medium">
                            ₹{(item.outstanding || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {(item.topProducts || []).slice(0, 3).map((p: any, i: number) => (
                            <span key={i}>
                              {p.productName} ({p.quantity})
                              {i < Math.min(2, (item.topProducts || []).length - 1) ? ", " : ""}
                            </span>
                          ))}
                          {(!item.topProducts || item.topProducts.length === 0) && "-"}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
