# Loading design system

Shared skeleton and loading primitives for the tenant app. Built on `components/ui/skeleton.tsx`.

## Components

| Component | Use when |
|-----------|----------|
| `PageSkeleton` | Full page shell (route `loading.tsx`, entitlement gates, initial data gate) |
| `TableSkeleton` | Data tables while fetching |
| `CardSkeleton` / `CardSkeletonGrid` | Metric cards, summary stats |
| `ChartSkeleton` | Chart areas |
| `FormSkeleton` | Create/edit forms loading record data |
| `ListSkeleton` | Client/lead/appointment list rows |
| `LoadingSpinner` | Inline or full-page spinner |
| `LoadingButton` | Save/Submit/Delete — blocks duplicate clicks |

## Two layers

1. **Route** — `app/<segment>/loading.tsx` shows instantly on navigation.
2. **Component** — `isPending` / `isLoading` shows skeleton while API runs after mount.

Use both: route skeleton for navigation; component skeleton for data latency.

## Rules

- Never `return null` during auth/entitlement checks — use `PageSkeleton` or `LoadingSpinnerPage`.
- Filter changes: skeleton **table rows only**; keep toolbar/filters visible.
- Mutations: `LoadingButton` or `disabled={isPending}`.
- Match final layout dimensions to avoid layout shift.
- No global blocking overlay for routine fetches.

## Examples

```tsx
// Route loading.tsx (server component)
import { PageSkeleton } from "@/components/loading"
export default function Loading() {
  return <PageSkeleton variant="table" />
}

// React Query gate
if (isPending && !data) return <TableSkeleton rows={8} />

// Mutation
<LoadingButton loading={save.isPending} loadingText="Saving…" onClick={save.mutate}>
  Save
</LoadingButton>
```
