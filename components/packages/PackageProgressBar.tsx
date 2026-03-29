"use client"

interface PackageProgressBarProps {
  used: number
  total: number
  label?: string
}

export function PackageProgressBar({ used, total, label }: PackageProgressBarProps) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
  const remaining = total - used

  const barColor =
    pct >= 90 ? "bg-red-500" :
    pct >= 60 ? "bg-yellow-500" :
    "bg-green-500"

  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{label}</span>
          <span>{used} / {total} used</span>
        </div>
      )}
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`${barColor} h-2 rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-gray-500 mt-1">{remaining} sitting{remaining !== 1 ? "s" : ""} remaining</p>
    </div>
  )
}
