export const ADMIN_TOKEN_KEY = "admin-auth-token"
export const ADMIN_USER_KEY = "admin-auth-user"

const getSessionStorage = () =>
  typeof window === "undefined" ? null : window.sessionStorage

const getLocalStorage = () =>
  typeof window === "undefined" ? null : window.localStorage

const migrateFromLocalStorage = (key: string) => {
  const session = getSessionStorage()
  const local = getLocalStorage()
  if (!session || !local) return null

  const value = local.getItem(key)
  if (value) {
    try {
      session.setItem(key, value)
      local.removeItem(key)
    } catch (error) {
      console.warn("Failed to migrate admin auth data to sessionStorage", error)
    }
    return value
  }
  return null
}

export const getAdminAuthToken = (): string | null => {
  const session = getSessionStorage()
  if (!session) return null
  const token = session.getItem(ADMIN_TOKEN_KEY)
  if (token) return token
  return migrateFromLocalStorage(ADMIN_TOKEN_KEY)
}

export const getAdminAuthUser = (): string | null => {
  const session = getSessionStorage()
  if (!session) return null
  const user = session.getItem(ADMIN_USER_KEY)
  if (user) return user
  return migrateFromLocalStorage(ADMIN_USER_KEY)
}

export const setAdminAuthSession = (token: string, adminData: unknown) => {
  const session = getSessionStorage()
  const local = getLocalStorage()
  if (!session) return

  try {
    session.setItem(ADMIN_TOKEN_KEY, token)
    session.setItem(ADMIN_USER_KEY, JSON.stringify(adminData))
  } catch (error) {
    console.error("Failed to persist admin auth session", error)
  }

  if (local) {
    local.removeItem(ADMIN_TOKEN_KEY)
    local.removeItem(ADMIN_USER_KEY)
  }
}

export const clearAdminAuthSession = () => {
  const session = getSessionStorage()
  const local = getLocalStorage()
  session?.removeItem(ADMIN_TOKEN_KEY)
  session?.removeItem(ADMIN_USER_KEY)
  local?.removeItem(ADMIN_TOKEN_KEY)
  local?.removeItem(ADMIN_USER_KEY)
}

