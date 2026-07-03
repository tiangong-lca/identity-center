import { z } from 'zod'

/** 注册申请的应用/角色选择(设计 §4.6):多应用、每应用至多一角色、角色可空 */
export const requestedAccessEntrySchema = z.object({
  applicationCode: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  roleCode: z.string().min(1).max(64).optional(),
})

export const requestedAccessSchema = z
  .array(requestedAccessEntrySchema)
  .max(20)
  .refine(
    (entries) => new Set(entries.map((e) => e.applicationCode)).size === entries.length,
    { message: '申请的应用重复' },
  )

export type RequestedAccessEntry = z.infer<typeof requestedAccessEntrySchema>
