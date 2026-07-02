import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LocaleToggle } from "@/components/layout/locale-toggle";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { RegisterForm } from "@/features/registrations/register-form";
import { auth } from "@/lib/auth";

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect("/");
  const t = await getTranslations("register");
  const tc = await getTranslations("common");
  const ta = await getTranslations("auth");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-xl border border-border bg-card p-10">
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-xl font-semibold text-foreground">{tc("appName")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <RegisterForm />
        <p className="text-xs text-muted-foreground">
          {t("haveAccount")}{" "}
          <Link href="/login" className="text-primary hover:underline">
            {ta("signIn")}
          </Link>
        </p>
      </div>
      <div className="flex items-center gap-6">
        <LocaleToggle />
        <ThemeToggle />
      </div>
    </main>
  );
}
