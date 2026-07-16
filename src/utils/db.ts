// Compatibility layer: exports a `db` object backed by the self-hosted
// API (see src/utils/apiClient.ts). Only the subset of the old client this
// codebase uses is implemented: .from() query chains, .rpc(), and
// auth.getUser().

import { from, rpc, authGetUser, API_URL } from './apiClient'

const isDevelopment = import.meta.env.MODE === 'development'

export const db = {
  from,
  rpc,
  auth: {
    async getUser() {
      const { user, error } = await authGetUser()
      return { data: { user }, error }
    },
  },
}

export const ENV_INFO = {
  isDevelopment,
  apiUrl: API_URL,
} as const
