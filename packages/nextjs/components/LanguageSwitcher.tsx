"use client";
import { useLanguage } from "./LanguageProvider";

export function LanguageSwitcher() {
  const { lang, setLang, t } = useLanguage();
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs">{t("language")}:</span>
      <button
        className={`btn btn-xs ${lang === "it" ? "btn-primary" : "btn-ghost"}`}
        onClick={() => setLang("it")}
      >
        {t("italian")}
      </button>
      <button
        className={`btn btn-xs ${lang === "en" ? "btn-primary" : "btn-ghost"}`}
        onClick={() => setLang("en")}
      >
        {t("english")}
      </button>
    </div>
  );
}
