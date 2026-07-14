'use client'

import { useEffect } from 'react'

export function AutoSubmit() {
  useEffect(() => {
    const form = document.querySelector('form') as HTMLFormElement | null
    form?.requestSubmit()
  }, [])
  return null
}
