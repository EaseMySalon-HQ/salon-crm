export default function SalonNotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold">Salon not found</h1>
      <p className="mt-2 max-w-md text-stone-600">
        This salon website is unavailable, disabled, or the link is incorrect.
      </p>
    </div>
  )
}
