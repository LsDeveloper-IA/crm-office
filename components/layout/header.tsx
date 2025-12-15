// components/layout/header.tsx
"use client";

import Image from "next/image";
import Form from "../modalForm";
import { useState } from "react";

type HeaderProps = {
  onToggleSidebar: () => void;
};

export function Header({ onToggleSidebar }: HeaderProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  return (
    <header className="w-full h-20 px-7 py-5 flex items-center justify-between">
      <button onClick={onToggleSidebar}>
        <Image src="/icons/menu.svg" width={36} height={36} alt="Menu" />
      </button>

      <h1 className="text-xl font-bold">My Application</h1>

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