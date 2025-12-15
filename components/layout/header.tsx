// components/layout/header.tsx
"use client";

import Image from "next/image";

type HeaderProps = {
  onToggleSidebar: () => void;
};

export function Header({ onToggleSidebar }: HeaderProps) {
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
            <Image src="/icons/plus.svg" width={36} height={36} alt="Add" />
          </li>
        </ul>
      </nav>
    </header>
  );
}