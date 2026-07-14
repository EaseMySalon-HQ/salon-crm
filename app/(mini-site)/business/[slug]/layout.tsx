import { headers } from 'next/headers'
import { permanentRedirect } from 'next/navigation'
import { MiniSiteShell } from '@/components/mini-site/mini-site-shell'
import { loadSiteProfile } from '@/lib/mini-site-server'
import { miniSiteBasePath } from '@/lib/mini-site-path'

export default async function MiniSiteLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const profile = await loadSiteProfile(slug)
  const requested = String(slug).trim().toLowerCase()
  if (profile.slug && requested && profile.slug !== requested) {
    const hdrs = await headers()
    const requestedPath = miniSiteBasePath(requested)
    const pathname = hdrs.get('x-pathname') || requestedPath
    const suffix = pathname.startsWith(requestedPath)
      ? pathname.slice(requestedPath.length)
      : ''
    permanentRedirect(miniSiteBasePath(profile.slug) + suffix)
  }
  return (
    <MiniSiteShell slug={profile.slug} profile={profile}>
      {children}
    </MiniSiteShell>
  )
}
