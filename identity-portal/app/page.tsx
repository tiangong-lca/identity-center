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
  const session = await auth();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold text-primary">{t("title")}</h1>
      <p className="text-sm text-secondary-foreground">{t("description")}</p>

      {session?.user ? (
        <div className="flex w-full max-w-3xl flex-col items-center gap-6">
          <div className="flex w-full flex-col items-center gap-3 rounded-lg border border-border bg-card p-6">
            <p className="text-sm text-foreground" data-testid="session-email">
              {ta("signedInAs", { email: session.user.email ?? session.user.keycloakSub })}
            </p>
            {session.user.isAdmin ? (
              <p className="text-xs text-success">{ta("adminBadge")}</p>
            ) : null}
            <div className="flex flex-wrap items-center justify-center gap-3">
              {session.user.isAdmin ? (
                <Link
                  href="/admin"
                  className="rounded bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-hover"
                >
                  {tp("adminConsole")}
                </Link>
              ) : null}
              <Link
                href="/account"
                className="rounded border border-border bg-card px-4 py-1.5 text-sm hover:bg-background"
              >
                {tp("accountCenter")}
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button
                  type="submit"
                  className="rounded border border-border bg-card px-4 py-1.5 text-sm hover:bg-background"
                >
                  {ta("signOut")}
                </button>
              </form>
            </div>
          </div>

          <QueryProvider>
            <MyApps />
          </QueryProvider>
        </div>
      ) : (
        <Link
          href="/login"
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
        >
          {ta("signIn")}
        </Link>
      )}

      <div className="flex items-center gap-6 rounded-lg border border-border bg-card p-4">
        <LocaleToggle />
        <ThemeToggle />
      </div>
    </main>
  );
}
