"use client";
import React, { createContext, useContext, useState, useEffect } from "react";
import it from "../locales/it.json";
import en from "../locales/en.json";

const translations = { it, en };

const LanguageContext = createContext({
  lang: "it",
  setLang: (lang: "it" | "en") => {},
  t: (key: string) => key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<"it" | "en">("it");
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("lang") : null;
    if (stored === "it" || stored === "en") setLang(stored);
  }, []);
  const setLangAndStore = (l: "it" | "en") => {
    setLang(l);
    if (typeof window !== "undefined") localStorage.setItem("lang", l);
  };
  // Support dot notation for nested keys
  const t = (key: string) => {
    const parts = key.split(".");
    let value: any = translations[lang];
    for (const part of parts) {
      if (value && typeof value === "object" && part in value) {
        value = value[part];
      } else {
        return key;
      }
    }
    return typeof value === "string" ? value : key;
  };
  return (
    <LanguageContext.Provider value={{ lang, setLang: setLangAndStore, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
