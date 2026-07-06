// lib/catalog/schema.ts
import { z } from 'zod'

/** 业务角色目录项(不含默认 member;经 webhook 交付,不建 KC client role) */
export const catalogRoleSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9_-]+$/, 'role code 仅限小写字母/数字/下划线/连字符'),
  name: z.string().min(1).max(100),
  description: z.string().max(300).optional(),
})

export const catalogAppSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'app code 仅限小写字母/数字/连字符'),
  name: z.string().min(1).max(100),
  status: z.enum(['active', 'disabled']).default('active'),
  keycloak: z.object({
    clientId: z.string().min(1),
    accessRole: z.string().min(1),
  }),
  webhook: z
    .object({
      url: z.string().min(1),
      secretRef: z
        .string()
        .regex(/^[A-Z][A-Z0-9_]*$/, 'secretRef 必须是 env 变量名(不放明文)'),
    })
    .optional(),
  loginUrl: z.string().optional(),
  adminUrl: z.string().optional(),
  roles: z.array(catalogRoleSchema).default([]),
})

export const catalogDocSchema = z
  .object({
    version: z.literal(1),
    applications: z.array(catalogAppSchema),
  })
  .superRefine((doc, ctx) => {
    const appCodes = new Set<string>()
    doc.applications.forEach((app, i) => {
      if (appCodes.has(app.code)) {
        ctx.addIssue({ code: 'custom', message: `重复应用 code: ${app.code}`, path: ['applications', i, 'code'] })
      }
      appCodes.add(app.code)
      const roleCodes = new Set<string>()
      app.roles.forEach((role, j) => {
        if (roleCodes.has(role.code)) {
          ctx.addIssue({ code: 'custom', message: `应用 ${app.code} 内重复角色 code: ${role.code}`, path: ['applications', i, 'roles', j, 'code'] })
        }
        roleCodes.add(role.code)
      })
    })
  })

export type CatalogRole = z.infer<typeof catalogRoleSchema>
export type CatalogApp = z.infer<typeof catalogAppSchema>
export type CatalogDoc = z.infer<typeof catalogDocSchema>
