import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { shouldNoindex } from "@/lib/seo/route-classification"

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-pathname", pathname)

  if (!shouldNoindex(pathname)) {
    return NextResponse.next({
      request: { headers: requestHeaders },
    })
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  })
  response.headers.set("X-Robots-Tag", "noindex, nofollow")
  return response
}

export const config = {
  matcher: [
    /*
     * Match all paths except static files and Next.js internals.
     */
    "/((?!_next/static|_next/image|favicon.ico|images/).*)",
  ],
}
