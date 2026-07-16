// HTTP client for the self-hosted API (replaces @supabase/supabase-js).
// Exposes a `db` object implementing the subset of the supabase-js query
// builder this codebase uses, so existing call sites keep working unchanged.

export const API_URL: string = import.meta.env.VITE_API_URL || '/api'

const TOKEN_KEY = 'auth_token'

export interface ApiUser {
  id: string
  email: string
  created_at?: string
}

export interface ApiError {
  message: string
  code?: string
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

async function parseJson(res: Response): Promise<any> {
  const text = await res.text()
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return { error: { message: text || `HTTP ${res.status}` } }
  }
}

export async function apiFetch(
  path: string,
  options: { method?: string; body?: unknown; formData?: FormData } = {}
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  let body: BodyInit | undefined
  if (options.formData) {
    body = options.formData
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method || (body !== undefined ? 'POST' : 'GET'),
    headers,
    body,
  })
  return { status: res.status, json: await parseJson(res) }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function authSignUp(
  email: string,
  password: string
): Promise<{ user: ApiUser | null; error: ApiError | null }> {
  const { json } = await apiFetch('/auth/signup', { body: { email, password } })
  if (json.error) return { user: null, error: json.error }
  setToken(json.token)
  return { user: json.user, error: null }
}

export async function authSignIn(
  email: string,
  password: string
): Promise<{ user: ApiUser | null; error: ApiError | null }> {
  const { json } = await apiFetch('/auth/login', { body: { email, password } })
  if (json.error) return { user: null, error: json.error }
  setToken(json.token)
  return { user: json.user, error: null }
}

export async function authGetUser(): Promise<{ user: ApiUser | null; error: ApiError | null }> {
  if (!getToken()) return { user: null, error: null }
  const { json, status } = await apiFetch('/auth/me')
  if (status === 401) {
    clearToken()
    return { user: null, error: null }
  }
  if (json.error) return { user: null, error: json.error }
  return { user: json.user, error: null }
}

export function authSignOut(): void {
  clearToken()
}

// ---------------------------------------------------------------------------
// Query builder (supabase-js subset: from().select/insert/update/upsert/delete
// with eq/in/order/limit/single/maybeSingle and { count, head })
// ---------------------------------------------------------------------------

interface QueryState {
  table: string
  action: 'select' | 'insert' | 'update' | 'upsert' | 'delete'
  select?: string
  filters: { op: 'eq' | 'in'; column: string; value: unknown }[]
  order: { column: string; ascending?: boolean }[]
  limit?: number
  single?: boolean
  maybeSingle?: boolean
  count?: 'exact'
  head?: boolean
  values?: unknown
  onConflict?: string
  returning?: boolean
}

export interface QueryResult<T = any> {
  data: T
  error: ApiError | null
  count: number | null
}

class QueryBuilder implements PromiseLike<QueryResult> {
  private state: QueryState

  constructor(table: string) {
    this.state = { table, action: 'select', filters: [], order: [] }
  }

  select(columns?: string, options?: { count?: 'exact'; head?: boolean }): this {
    if (this.state.action === 'select') {
      this.state.select = columns || '*'
      if (options?.count) this.state.count = options.count
      if (options?.head) this.state.head = options.head
    } else {
      // .select() after insert/update/upsert -> RETURNING *
      this.state.returning = true
    }
    return this
  }

  insert(values: unknown): this {
    this.state.action = 'insert'
    this.state.values = values
    return this
  }

  upsert(values: unknown, options?: { onConflict?: string }): this {
    this.state.action = 'upsert'
    this.state.values = values
    this.state.onConflict = options?.onConflict
    return this
  }

  update(values: unknown): this {
    this.state.action = 'update'
    this.state.values = values
    return this
  }

  delete(): this {
    this.state.action = 'delete'
    return this
  }

  eq(column: string, value: unknown): this {
    this.state.filters.push({ op: 'eq', column, value })
    return this
  }

  in(column: string, values: unknown[]): this {
    this.state.filters.push({ op: 'in', column, value: values })
    return this
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.state.order.push({ column, ascending: options?.ascending })
    return this
  }

  limit(n: number): this {
    this.state.limit = n
    return this
  }

  single(): this {
    this.state.single = true
    return this
  }

  maybeSingle(): this {
    this.state.maybeSingle = true
    return this
  }

  private async execute(): Promise<QueryResult> {
    const { json } = await apiFetch('/db/query', { body: this.state })
    if (json.error) {
      return { data: null, error: json.error, count: null }
    }
    return { data: json.data ?? null, error: null, count: json.count ?? null }
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }
}

export function from(table: string): QueryBuilder {
  return new QueryBuilder(table)
}

export async function rpc(
  fn: string,
  args: Record<string, unknown> = {}
): Promise<{ data: any; error: ApiError | null }> {
  const { json } = await apiFetch(`/rpc/${fn}`, { body: args })
  if (json.error) return { data: null, error: json.error }
  return { data: json.data ?? null, error: null }
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

export async function uploadPhoto(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  const { json } = await apiFetch('/photos', { method: 'POST', formData })
  if (json.error) throw new Error(json.error.message)
  return json.url
}

export async function deletePhoto(): Promise<void> {
  const { json } = await apiFetch('/photos', { method: 'DELETE' })
  if (json.error) throw new Error(json.error.message)
}

/** Base URL for statically served photos (sibling of /api on the same host). */
export function photoUrl(pathname: string): string {
  const base = API_URL.replace(/\/api\/?$/, '')
  return `${base}${pathname.startsWith('/') ? '' : '/'}${pathname}`
}
