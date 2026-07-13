import type { SiteStaff } from '@/lib/public-site-api'

export function StaffCard({ staff }: { staff: SiteStaff }) {
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-5 text-center shadow-sm">
      {staff.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={staff.avatar}
          alt={staff.name}
          className="mx-auto h-24 w-24 rounded-full object-cover"
        />
      ) : (
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-stone-100 text-2xl font-semibold text-stone-500">
          {staff.name.slice(0, 1)}
        </div>
      )}
      <h3 className="mt-4 font-medium">{staff.name}</h3>
      <p className="text-sm text-stone-500">{staff.title}</p>
      {staff.specialties?.length ? (
        <p className="mt-2 text-xs text-stone-500">{staff.specialties.slice(0, 3).join(' · ')}</p>
      ) : null}
      {staff.shortDescription ? (
        <p className="mt-3 line-clamp-3 text-sm text-stone-600">{staff.shortDescription}</p>
      ) : null}
    </article>
  )
}
