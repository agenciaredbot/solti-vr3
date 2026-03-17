/**
 * Auth Callback — Handles Supabase OAuth/magic link redirects.
 * Exchanges the code for a session, then redirects to dashboard.
 */
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function getSafeRedirect(value: string | null): string {
  if (!value) return '/dashboard'
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('://')) return value
  return '/dashboard'
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const redirect = getSafeRedirect(searchParams.get('redirect'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${redirect}`)
    }
  }

  // Auth error — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
