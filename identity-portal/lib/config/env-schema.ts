import { z } from 'zod'

export const envSchema = z.object({
  DATABASE_URL: z.url(),
  KEYCLOAK_BASE_URL: z.url(),
  KEYCLOAK_REALM: z.string().min(1),
  REDIS_URL: z.url(),
  RABBITMQ_URL: z.url(),
  AUTH_SECRET: z.string().min(32),
  KEYCLOAK_CLIENT_ID: z.string().min(1),
  KEYCLOAK_CLIENT_SECRET: z.string().min(1),
  KEYCLOAK_ADMIN_API_CLIENT_SECRET: z.string().min(1),
})

export type Env = z.infer<typeof envSchema>

export type ValidateEnvResult =
  | { ok: true; env: Env }
  | { ok: false; missing: string[] }

export function validateEnv(
  env: Record<string, string | undefined>,
): ValidateEnvResult {
  const parsed = envSchema.safeParse(env)
  if (parsed.success) return { ok: true, env: parsed.data }
  return {
    ok: false,
    missing: [...new Set(parsed.error.issues.map((i) => i.path.join('.')))],
  }
}
