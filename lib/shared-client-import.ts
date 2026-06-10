import { ClientsAPI } from "@/lib/api"
import type { Client } from "@/lib/client-store"
import { clientStore } from "@/lib/client-store"

export function isSharedPreviewClient(client: Partial<Client> | null | undefined): boolean {
  return client?.sharedPreview === true
}

function normalizeImportedClient(raw: Record<string, unknown>): Client {
  const id = String(raw._id || raw.id || "")
  return {
    ...(raw as Client),
    id,
    _id: id,
    sharedPreview: undefined,
    sourceBranchId: undefined,
  }
}

/** Import a sibling-branch preview client into the current branch (by phone). */
export async function ensureLocalSharedClient(client: Client): Promise<Client> {
  if (!isSharedPreviewClient(client)) return client

  const phone = client.phone?.trim()
  if (!phone) {
    throw new Error("Client phone is required to import profile")
  }

  const res = await ClientsAPI.ensureShared(phone)
  if (!res.success || !res.data) {
    throw new Error(typeof res.error === "string" ? res.error : "Failed to import client profile")
  }

  clientStore.clearSearchCache()
  return normalizeImportedClient(res.data as Record<string, unknown>)
}
