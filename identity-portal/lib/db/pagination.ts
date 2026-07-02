export type PageParams = {
  page?: number
  pageSize?: number
}

export type PageResult<T> = {
  items: T[]
  page: number
  pageSize: number
  total: number
}

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

/** 规范化分页参数并给出 limit/offset */
export function paginate(params: PageParams) {
  const page = Math.max(1, Math.floor(params.page ?? 1))
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(params.pageSize ?? DEFAULT_PAGE_SIZE)))
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize }
}

export function buildPageResult<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): PageResult<T> {
  return { items, page, pageSize, total }
}
