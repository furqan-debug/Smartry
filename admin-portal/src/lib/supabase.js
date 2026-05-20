import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'dummy'

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.error('Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in admin-portal/.env or in your environment.')
}

if (supabaseUrl.includes('localhost:54321') || supabaseAnonKey === 'dummy') {
  console.warn('Supabase is using fallback local config. This will fail unless a local Supabase instance is reachable at http://localhost:54321 from the browser.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
