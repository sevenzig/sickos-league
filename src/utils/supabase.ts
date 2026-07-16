// Compatibility layer: exports a `supabase` object backed by the self-hosted
// API (see src/utils/apiClient.ts) so legacy call sites keep working after
// the Supabase removal. Only the subset of supabase-js this codebase uses is
// implemented: .from() query chains, .rpc(), and auth.getUser().

import { from, rpc, authGetUser, API_URL } from './apiClient'

const isDevelopment = import.meta.env.MODE === 'development'

export const supabase = {
  from,
  rpc,
  auth: {
    async getUser() {
      const { user, error } = await authGetUser()
      return { data: { user }, error }
    },
  },
}

// Feature flags
export const FEATURE_FLAGS = {
  ENABLE_MULTI_LEAGUE: import.meta.env.VITE_ENABLE_MULTI_LEAGUE === 'true',
} as const

// Environment info
export const ENV_INFO = {
  isDevelopment,
  apiUrl: API_URL,
  multiLeagueEnabled: FEATURE_FLAGS.ENABLE_MULTI_LEAGUE,
} as const
