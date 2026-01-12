"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import clsx from "clsx";
import { HomeIcon } from "../icons/HomeIcon";
import { CompanyIcon } from "../icons/CompanyIncon";

const menuItems = [
  {
    href: "/dashboard",
    icon: HomeIcon,
    label: "Dashboard",
  },
  {
    href: "/dashboard/empresas",
    icon: CompanyIcon,
    label: "Empresas",
  }
];

export function MenuBar() {
  const pathname = usePathname();

  return (
    <aside className="h-full w-20 flex flex-col items-center pt-6 border-r bg-white">
      {/* Logo */}
      <Image
        src="/logos/logo.svg"
        width={36}
        height={36}
        alt="Logo"
        className="mb-6"
      />

      {menuItems.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className="relative flex items-center justify-center h-16 w-full"
          >
            {/* Barra azul lateral */}
            {isActive && (
              <span className="absolute right-0 top-1/2 -translate-y-1/2 h-full w-1 rounded-full bg-[#5E81F4]" />
            )}

            {/* Ícone */}
            <div className={clsx(
              "w-12 h-12 flex items-center justify-center rounded-lg transition-colors",
              isActive ? "bg-[#5E81F4]/10" : "hover:bg-gray-100"
            )}>
              <Icon
                className={clsx(
                  "w-8 h-8 transition-colors",
                  isActive ? "text-[#5E81F4]" : "text-[#8181A5]"
                )}
              />
            </div>
          </Link>
        );
      })}
    </aside>
  );
}