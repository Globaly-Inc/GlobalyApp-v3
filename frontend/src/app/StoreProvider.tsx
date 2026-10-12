'use client'
import { useEffect, useRef, useState } from 'react'
import { Provider } from 'react-redux'
import { makeStore, type AppStore } from '../lib/store'
import { restoreSession, settleInitializing } from './auth/store/auth-slice'
import { getAccessToken, hasSessionHint } from '@/lib/session'
import { refreshAccessToken } from '@/lib/api/http'
// import { RoleSelectGate } from './auth/role-select-gate'

export default function StoreProvider({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  const [store] = useState<AppStore>(() => makeStore())
  const restored = useRef(false)

  useEffect(() => {
    if (restored.current) return
    restored.current = true
    if (getAccessToken()) {
      store.dispatch(restoreSession())
    } else if (hasSessionHint()) {
      // Signed in on the other host (or this tab's token was cleared): the API's refresh cookie
      // mints this host its own access token. No hint, no request — anonymous visitors never
      // spend the /auth/refresh rate limit.
      void refreshAccessToken().then((result) => {
        if (result === 'ok') store.dispatch(restoreSession())
        else store.dispatch(settleInitializing())
      })
    } else {
      store.dispatch(settleInitializing())
    }
  }, [store])

  return (
    <Provider store={store}>
      {children}
      {/* <RoleSelectGate /> */}
    </Provider>
  )
}
