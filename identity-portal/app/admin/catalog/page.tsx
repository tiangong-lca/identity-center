// app/admin/catalog/page.tsx —— 旧路由,P3 后已并入「应用 › 应用注册表」;307 重定向保住旧链接不 404。
import { redirect } from 'next/navigation'

export default function CatalogRedirect() {
  redirect('/admin/apps/registry')
}
