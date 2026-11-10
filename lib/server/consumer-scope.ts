// Candidate deployment boundary, never a browser-selected filter.
export function isolatedReadIds(): number[] | null {
  if (!process.env.JNQ_PUBLIC_FEED_ORIGIN) return null
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://rnamstwwbzknwbjwdgrf.supabase.co') throw new Error('Candidate database scope mismatch.')
  return [92061, 92062]
}
