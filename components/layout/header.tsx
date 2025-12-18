"use client";
import { usePathname } from "next/navigation";
import Image from "next/image";
import Form from "../modalForm";
import { useState } from "react";

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
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);
  const pathname = usePathname();

  const title =
    PAGE_TITLES[pathname] ??
    PAGE_TITLES[
      Object.keys(PAGE_TITLES).find((route) =>
        pathname.startsWith(route)
      ) ?? ""
    ] ??
    "My Application";

  return (
    <header className="w-full h-20 px-7 py-5 flex items-center justify-between">
      <button onClick={onToggleSidebar}>
        <Image src="/icons/menu.svg" width={36} height={36} alt="Menu" />
      </button>

      <h1 className="text-xl font-bold text-left w-full mx-5">
        {title}
      </h1>

      <nav>
        <ul className="flex space-x-1.5">
          <li>
            <Image src="/icons/search.svg" width={36} height={36} alt="Search" />
          </li>
          <li>
            <Image src="/icons/plus.svg" width={36} height={36} alt="Add" onClick={openModal}/>

            <Form
              isOpen={isModalOpen}
              onClose={closeModal}
            />
          </li>
        </ul>
      </nav>
    </header>
  );
}