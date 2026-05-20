import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://localhost:54321'
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'dummy'

if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
  console.error('Supabase is not configured. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in worker-app/.env or in Expo environment variables.')
}

if (supabaseUrl.includes('localhost:54321') || supabaseAnonKey === 'dummy') {
  console.warn('Supabase is using fallback local config. This will fail unless the mobile app has access to a local Supabase instance at http://localhost:54321 from the device/emulator.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
