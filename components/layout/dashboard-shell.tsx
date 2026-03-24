"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { MenuBar } from "@/components/layout/menu-bar";
import { Sidebar } from "@/components/layout/sidebar";

type Props = {
  children: React.ReactNode;
  userName: string;
  userRole: string;
};

export default function DashboardShell({ children, userName, userRole }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const canAccessCompanies = userRole !== "USER";

  return (
    <div className="flex min-h-screen">
      
      {/* MENU */}
      <aside className="w-20 border-r shrink-0">
        <MenuBar canAccessCompanies={canAccessCompanies} />
      </aside>

      {/* SIDEBAR */}
      <aside
        className={`transition-all duration-300 overflow-hidden border-r bg-white
          ${sidebarOpen ? "w-[387px]" : "w-0"}
        `}
      >
        <Sidebar name={userName} />
      </aside>

      {/* CONTEÚDO */}
      <main className="flex flex-col flex-1 min-w-0 min-h-0 bg-[#F5F5FA]">
        <Header
          onToggleSidebar={() => setSidebarOpen(v => !v)}
          canAccessCompanies={canAccessCompanies}
        />

        <section className="p-7 h-full w-full flex flex-col">
          {children}
        </section>
      </main>

    </div>
  );
}
