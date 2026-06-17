import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { shouldNoindex } from "@/lib/seo/route-classification"

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!shouldNoindex(pathname)) {
    return NextResponse.next()
  }

  const response = NextResponse.next()
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
