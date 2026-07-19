"use client";

import { LOCALE_COOKIE, type Locale } from "../lib/i18n";

export default function LanguageToggle({ locale }: { locale: Locale }) {
  const switchLocale = (nextLocale: Locale) => {
    if (nextLocale === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    window.location.reload();
  };

  return (
    <div className="language-toggle" role="group" aria-label="Language">
      <button type="button" className={locale === "ja" ? "is-active" : ""} aria-pressed={locale === "ja"} onClick={() => switchLocale("ja")}>日本語</button>
      <span aria-hidden="true">/</span>
      <button type="button" className={locale === "en" ? "is-active" : ""} aria-pressed={locale === "en"} onClick={() => switchLocale("en")}>EN</button>
    </div>
  );
}
