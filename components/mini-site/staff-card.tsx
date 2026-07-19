import type { SiteStaff } from '@/lib/public-site-api'
import { ST } from '@/lib/mini-site-theme'
import { cn } from '@/lib/utils'

export function StaffCard({ staff }: { staff: SiteStaff }) {
  return (
    <article className={cn('p-5 text-center', ST.card)}>
      {staff.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={staff.avatar}
          alt={staff.name}
          className="mx-auto h-24 w-24 rounded-full object-cover"
        />
      ) : (
        <div
          className={cn(
            'mx-auto flex h-24 w-24 items-center justify-center rounded-full text-2xl font-semibold',
            ST.iconSoft
          )}
        >
          {staff.name.slice(0, 1)}
        </div>
      )}
      <h3 className={cn('mt-4 font-medium', ST.textPrimary)}>{staff.name}</h3>
      <p className={cn('text-sm', ST.textMuted)}>{staff.title}</p>
      {staff.specialties?.length ? (
        <p className={cn('mt-2 text-xs', ST.textMuted)}>{staff.specialties.slice(0, 3).join(' · ')}</p>
      ) : null}
      {staff.shortDescription ? (
        <p className={cn('mt-3 line-clamp-3 text-sm', ST.textMuted)}>{staff.shortDescription}</p>
      ) : null}
    </article>
  )
}
