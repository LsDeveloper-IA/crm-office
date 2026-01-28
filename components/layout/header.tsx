"use client";

import { usePathname } from "next/navigation";
import Image from "next/image";
import { useState } from "react";
import { NewCompanyModal } from "./NewCompanyModal";
import { useSectors } from "@/app/dashboard/empresas/hooks/useSectors";
import { HeaderSearchCommand } from "./HeaderSearchCommand"; // ✅ novo

type HeaderProps = {
  onToggleSidebar: () => void;
};

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/empresas": "Empresas",
  "/dashboard/usuarios": "Usuários",
  "/dashboard/configuracoes": "Configurações",
};

export function Header({ onToggleSidebar }: HeaderProps) {
  const pathname = usePathname();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false); // ✅ novo

  const sectors = useSectors();

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

            <li>
              <button
                onClick={() => setIsAddOpen(true)}
                className="cursor-pointer"
              >
                <Image src="/icons/plus.svg" width={36} height={36} alt="Add" />
              </button>
            </li>
          </ul>
        </nav>
      </header>

      {/* ✅ Command Palette */}
      <HeaderSearchCommand open={isSearchOpen} onOpenChange={setIsSearchOpen} />

      {/* MODAL */}
      <NewCompanyModal
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreated={() => {
          setIsAddOpen(false);
        }}
        sectors={sectors}
      />
    </>
  );
}
