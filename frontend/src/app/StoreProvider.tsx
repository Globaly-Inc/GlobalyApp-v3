'use client'
import { useState } from 'react'
import { Provider } from 'react-redux'
import { makeStore, type AppStore } from '../lib/store'

export default function StoreProvider({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  const [store] = useState<AppStore>(() => makeStore())

  return <Provider store={store}>{children}</Provider>
}