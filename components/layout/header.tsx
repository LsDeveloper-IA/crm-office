"use client";

import { usePathname } from "next/navigation";
import Image from "next/image";
import { useState } from "react";
import { NewCompanyModal } from "./NewCompanyModal";
import { useSectors } from "@/app/dashboard/empresas/hooks/useSectors";
import { HeaderSearchCommand } from "./HeaderSearchCommand"; // ✅ novo
import Link from "next/link";

type HeaderProps = {
  onToggleSidebar: () => void;
  canAccessCompanies: boolean;
};

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/empresas": "Empresas",
  "/dashboard/distribuicao-lucros": "Distribuição de Lucros",
  "/dashboard/settings": "Configurações",
};

export function Header({ onToggleSidebar, canAccessCompanies }: HeaderProps) {
  const pathname = usePathname();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false); // ✅ novo

  const sectors = useSectors(canAccessCompanies);

  const title =
    PAGE_TITLES[pathname] ??
    PAGE_TITLES[
    Object.keys(PAGE_TITLES).find((route) => pathname.startsWith(route)) ?? ""
    ] ??
    "My Application";

  return (
    <>
      <header className="w-full h-20 px-7 py-5 flex items-center justify-between">
        {/* MENU */}
        <button onClick={onToggleSidebar}>
          <Image src="/icons/menu.svg" width={36} height={36} alt="Menu" />
        </button>

        {/* TITLE */}
        <h1 className="text-xl font-bold text-left w-full mx-5">{title}</h1>

        {/* ACTIONS */}
        <nav>
          <ul className="flex space-x-1.5">
            {canAccessCompanies ? (
              <li>
                <button
                  type="button"
                  onClick={() => setIsSearchOpen(true)}
                  className="cursor-pointer"
                  aria-label="Pesquisar"
                >
                  <Image src="/icons/search.svg" width={36} height={36} alt="Search" />
                </button>
              </li>
            ) : null}

            {canAccessCompanies ? (
              <li>
                <button
                  onClick={() => setIsAddOpen(true)}
                  className="cursor-pointer"
                >
                  <Image src="/icons/plus.svg" width={36} height={36} alt="Add" />
                </button>
              </li>
            ) : null}
            <li>
              <Link href="/dashboard/settings" className="cursor-pointer">
                <Image src="/icons/settings.svg" width={36} height={36} alt="Settings" />
              </Link>
            </li>
          </ul>
        </nav>
      </header>

      {/* ✅ Command Palette */}
      {canAccessCompanies ? (
        <HeaderSearchCommand open={isSearchOpen} onOpenChange={setIsSearchOpen} />
      ) : null}

      {/* MODAL */}
      {canAccessCompanies ? (
        <NewCompanyModal
          open={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          onCreated={() => {
            setIsAddOpen(false);
          }}
          sectors={sectors}
        />
      ) : null}
    </>
  );
}
