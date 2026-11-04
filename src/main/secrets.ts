import { safeStorage } from 'electron'

/** Encrypts a secret into a base64 blob, or returns null when the OS store is unavailable. */
export function encryptSecret(text: string): string | null {
  if (!text) return null
  try {
    if (!safeStorage.isEncryptionAvailable()) return null
    return safeStorage.encryptString(text).toString('base64')
  } catch {
    return null
  }
}

/** Decrypts a base64 blob. Returns null when it cannot be decrypted (e.g. different user/machine). */
export function decryptSecret(blob: string | undefined): string | null {
  if (!blob) return null
  try {
    if (!safeStorage.isEncryptionAvailable()) return null
    return safeStorage.decryptString(Buffer.from(blob, 'base64'))
  } catch {
    return null
  }
}

export function secretsAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}
