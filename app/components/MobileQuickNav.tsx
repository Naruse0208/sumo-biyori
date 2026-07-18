"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/#torikumi", label: "取組", mark: "取", test: (path: string) => path === "/" },
  { href: "/rate", label: "レート", mark: "率", test: (path: string) => path === "/rate" || path.startsWith("/rikishi/") },
  { href: "/rate/compare", label: "比較", mark: "比", test: (path: string) => path === "/rate/compare" },
  { href: "/rate/yokozuna", label: "歴代", mark: "綱", test: (path: string) => path === "/rate/yokozuna" || path === "/rate/era" },
];

export default function MobileQuickNav() {
  const pathname = usePathname();
  return (
    <nav className="mobile-quick-nav" aria-label="主要ページ">
      {items.map((item) => {
        const active = item.test(pathname);
        return (
          <Link key={item.label} href={item.href} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined}>
            <span aria-hidden="true">{item.mark}</span>
            <small>{item.label}</small>
          </Link>
        );
      })}
    </nav>
  );
}
