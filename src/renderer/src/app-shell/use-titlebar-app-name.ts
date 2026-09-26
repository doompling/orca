import { useEffect, useState } from 'react'

export function useTitlebarAppName(): string | null {
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    const getIdentity = window.api?.app?.getIdentity
    if (!getIdentity) {
      return
    }
    let cancelled = false
    void getIdentity()
      .then((identity) => {
        if (cancelled || identity.isDev || identity.name === 'Orca') {
          return
        }
        setName(identity.name)
        document.title = identity.name
      })
      .catch(() => {
        // Keep the existing label if the identity read is unavailable.
      })
    return () => {
      cancelled = true
    }
  }, [])

  return name
}
