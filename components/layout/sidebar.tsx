// components/layout/sidebar.tsx
"use client";

import Image from "next/image";
import clsx from "clsx";

type SidebarProps = {
  name: string;
};

export function Sidebar({ name }: SidebarProps) {
  return (
    <aside
      className={clsx(
        "h-full bg-white pt-20 px-7 border-r"
      )}
    >
      <div className="flex flex-col">
        <Image src="/icons/user.svg" width={98} height={98} alt="User" />
        <span className="text-[22px] mt-3">Bem-vindo(a),</span>
        <span className="text-3xl font-bold mt-1">{name}</span>
      </div>
    </aside>
  );
}