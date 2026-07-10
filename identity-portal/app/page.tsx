import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { LocaleToggle } from "@/components/layout/locale-toggle";
import { QueryProvider } from "@/components/layout/query-provider";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { MyApps } from "@/features/account/my-apps";

export default async function HomePage() {
  const t = await getTranslations("home");
  const ta = await getTranslations("auth");
  const tp = await getTranslations("portal");
  const tc = await getTranslations("common");
  const session = await auth();

  if (!session?.user) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <h1 className="text-2xl font-semibold text-primary">{t("title")}</h1>
        <p className="text-sm text-secondary-foreground">{t("description")}</p>
        <Link
          href="/login"
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
        >
          {ta("signIn")}
        </Link>
      </main>
    );
  }

  const isAdmin = session.user.isAdmin;
  const userEmail = session.user.email ?? session.user.keycloakSub ?? "";

  return (
    <div className="flex flex-1 flex-row overflow-hidden">
      <aside className="flex w-[180px] shrink-0 flex-col bg-[#0080FF] text-white">
        <div className="flex h-[50px] items-center border-b border-white/10 px-4">
          <span className="text-sm font-semibold">{tc("appName")}</span>
        </div>
        <nav className="flex flex-col gap-0.5 p-2">
          <Link
            href="/"
            className="flex h-9 items-center rounded-md px-3 text-sm text-white/90 transition-colors hover:bg-white/30"
          >
            {tp("home")}
          </Link>
          <Link
            href="/account"
            className="flex h-9 items-center rounded-md px-3 text-sm text-white/90 transition-colors hover:bg-white/30"
          >
            {tp("accountCenter")}
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              className="flex h-9 items-center rounded-md px-3 text-sm text-white/90 transition-colors hover:bg-white/30"
            >
              {tp("adminConsole")}
            </Link>
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[50px] shrink-0 items-center justify-between border-b border-border bg-card px-4">
          <span
            className="max-w-40 truncate text-xs text-muted-foreground"
            title={userEmail}
          >
            {ta("signedInAs", { email: userEmail })}
          </span>
          <div className="flex items-center gap-4">
            <LocaleToggle />
            <ThemeToggle />
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="rounded border border-border bg-card px-3 py-1 text-xs hover:bg-background"
              >
                {ta("signOut")}
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <div className="mx-auto flex max-w-5xl flex-col gap-6">
            <div>
              <h1 className="text-xl font-semibold text-foreground">{t("title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
            </div>

            {isAdmin && (
              <p className="text-xs text-success">{ta("adminBadge")}</p>
            )}

            <QueryProvider>
              <MyApps />
            </QueryProvider>
          </div>
        </main>
      </div>
    </div>
  );
}
