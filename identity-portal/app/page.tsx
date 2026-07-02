import { getTranslations } from "next-intl/server";
import { LocaleToggle } from "@/components/layout/locale-toggle";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export default async function HomePage() {
  const t = await getTranslations("home");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold text-primary">{t("title")}</h1>
      <p className="text-sm text-secondary-foreground">{t("description")}</p>
      <div className="flex items-center gap-6 rounded-lg border border-border bg-card p-4">
        <LocaleToggle />
        <ThemeToggle />
      </div>
    </main>
  );
}
