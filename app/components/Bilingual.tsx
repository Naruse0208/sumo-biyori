import type { ReactNode } from "react";

export default function Bilingual({ ja, en }: { ja: ReactNode; en: ReactNode }) {
  return (
    <>
      <span className="lang-ja" lang="ja">{ja}</span>
      <span className="lang-en" lang="en">{en}</span>
    </>
  );
}
