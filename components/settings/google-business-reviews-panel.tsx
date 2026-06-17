"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, MessageSquare, Sparkles } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { GmbAPI } from "@/lib/api"

interface Review {
  reviewId: string
  reviewerName: string
  starRating: number
  comment: string
  createTime: string
  replyText?: string | null
  aiDraftText?: string | null
}

export function GoogleBusinessReviewsPanel({ addonEnabled }: { addonEnabled?: boolean }) {
  const { toast } = useToast()
  const mountedRef = useRef(true)
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("all")
  const [selected, setSelected] = useState<Review | null>(null)
  const [replyText, setReplyText] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const loadReviews = useCallback(async () => {
    if (!mountedRef.current) return
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (filter === "replied") params.replied = "true"
      if (filter === "unreplied") params.replied = "false"
      if (filter.startsWith("star-")) params.rating = filter.replace("star-", "")

      const res = await GmbAPI.getReviews(params)
      if (!mountedRef.current) return
      if (res.success) setReviews(res.data?.reviews || [])
    } catch {
      if (!mountedRef.current) return
      toast({ title: "Error", description: "Failed to load reviews", variant: "destructive" })
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [filter, toast])

  useEffect(() => {
    mountedRef.current = true
    void loadReviews()
    return () => {
      mountedRef.current = false
    }
  }, [loadReviews])

  const openReview = (r: Review) => {
    setSelected(r)
    setReplyText(r.replyText || r.aiDraftText || "")
  }

  const handleAiDraft = async () => {
    if (!selected) return
    try {
      const res = await GmbAPI.generateAiDraft(selected.reviewId)
      if (res.success) {
        setReplyText(res.data?.draft || "")
        toast({ title: "Draft ready", description: "AI reply generated." })
      }
    } catch {
      toast({ title: "Error", description: "AI draft failed", variant: "destructive" })
    }
  }

  const handleReply = async () => {
    if (!selected || !replyText.trim()) return
    setSubmitting(true)
    try {
      const res = await GmbAPI.replyToReview(selected.reviewId, replyText.trim())
      if (res.success) {
        toast({ title: "Reply posted", description: "Your reply is live on Google." })
        setSelected(null)
        await loadReviews()
      }
    } catch {
      toast({ title: "Error", description: "Failed to post reply", variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Google reviews</CardTitle>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="replied">Replied</SelectItem>
              <SelectItem value="unreplied">Unreplied</SelectItem>
              <SelectItem value="star-5">5 stars</SelectItem>
              <SelectItem value="star-1">1 star</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[480px] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : reviews.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No reviews synced yet.</p>
          ) : (
            reviews.map((r) => (
              <button
                key={r.reviewId}
                type="button"
                onClick={() => openReview(r)}
                className={`w-full text-left rounded-lg border p-3 hover:bg-slate-50 transition ${
                  selected?.reviewId === r.reviewId ? "border-blue-300 bg-blue-50/50" : "border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">{r.reviewerName}</span>
                  <Badge variant="outline">{r.starRating}★</Badge>
                </div>
                <p className="text-sm text-slate-600 mt-1 line-clamp-2">{r.comment || "(no comment)"}</p>
                {r.replyText && <p className="text-xs text-green-600 mt-1">Replied</p>}
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Reply
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!selected ? (
            <p className="text-sm text-slate-500">Select a review to reply.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">
                <strong>{selected.reviewerName}</strong> · {selected.starRating}★
              </p>
              <p className="text-sm text-slate-600">{selected.comment || "(star rating only)"}</p>
              <Textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={5}
                placeholder="Write your reply…"
              />
              <div className="flex gap-2">
                {addonEnabled && (
                  <Button variant="outline" size="sm" onClick={handleAiDraft}>
                    <Sparkles className="h-4 w-4 mr-1" />
                    AI draft
                  </Button>
                )}
                <Button size="sm" onClick={handleReply} disabled={submitting || !replyText.trim()}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post reply"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
