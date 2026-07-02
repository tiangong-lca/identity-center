import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { LocaleToggle } from "@/components/layout/locale-toggle";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");
  const t = await getTranslations("auth");
  const tc = await getTranslations("common");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-xl border border-border bg-card p-10">
        <h1 className="text-xl font-semibold text-foreground">{tc("appName")}</h1>
        <p className="text-sm text-muted-foreground">{t("loginHint")}</p>
        <form
          className="w-full"
          action={async () => {
            "use server";
            await signIn("keycloak", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="w-full rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
          >
            {t("signIn")}
          </button>
        </form>
        <p className="text-xs text-muted-foreground">
          {t("noAccount")}{" "}
          <a href="/register" className="text-primary hover:underline">
            {t("goRegister")}
          </a>
        </p>
      </div>
      <div className="flex items-center gap-6">
        <LocaleToggle />
        <ThemeToggle />
      </div>
    </main>
  );
}
