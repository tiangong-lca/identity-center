'use server'

import { signIn, signOut } from './index'

export async function logoutAndRedirectToKeycloak() {
  await signOut({ redirect: false, redirectTo: '/' })
  await signIn('keycloak', { redirectTo: '/' })
}
