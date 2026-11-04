import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (process.env.JNQ_PREVIEW_READ_ONLY === '1' && supabaseUrl !== 'https://rnamstwwbzknwbjwdgrf.supabase.co') {
  throw new Error('Preview database configuration rejected.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
