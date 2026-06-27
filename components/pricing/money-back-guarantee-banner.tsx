import Image from "next/image"

export function MoneyBackGuaranteeBanner() {
  return (
    <div className="mx-auto max-w-5xl rounded-xl bg-slate-100 px-6 py-8 sm:px-10 sm:py-10">
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-10">
        <Image
          src="/images/14-day-money-back-guarantee.png"
          alt="14 day money back guarantee"
          width={860}
          height={900}
          className="h-32 w-auto shrink-0 sm:h-36"
        />
        <div className="text-center sm:text-left">
          <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">14-Day Money-Back Guarantee</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
            Every annual EaseMySalon plan comes with a 14-day money-back guarantee. Use EaseMySalon in your
            salon with complete confidence. If it isn&apos;t the right fit within the first 14 days, we&apos;ll
            refund your annual subscription in full.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
            <span className="font-semibold text-red-600">Your satisfaction matters to us,</span> and we&apos;re
            committed to making your transition to EaseMySalon completely risk-free.
          </p>
        </div>
      </div>
    </div>
  )
}
