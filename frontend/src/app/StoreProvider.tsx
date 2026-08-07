'use client'
import { useEffect, useRef, useState } from 'react'
import { Provider } from 'react-redux'
import { makeStore, type AppStore } from '../lib/store'
import { restoreSession, settleInitializing } from './auth/store/auth-slice'
import { getAccessToken } from '@/lib/session'

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
    if (getAccessToken()) store.dispatch(restoreSession())
    else store.dispatch(settleInitializing())
  }, [store])

  return <Provider store={store}>{children}</Provider>
}
