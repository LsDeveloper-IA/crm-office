import Link from "next/link";

type SettingsNavProps = {
  activeItem: "conta" | "seguranca" | "usuarios";
  isAdmin: boolean;
};

const baseItemClassName = "text-left px-3 py-2 rounded-md";

function getItemClassName(isActive: boolean) {
  return `${baseItemClassName} ${isActive ? "bg-muted" : "hover:bg-muted"}`;
}

export function SettingsNav({ activeItem, isAdmin }: SettingsNavProps) {
  return (
    <aside className="w-64 rounded-lg bg-white p-5 shadow-2xl">
      <h2 className="mb-4 text-lg font-semibold">Configuracoes</h2>

      <nav className="flex flex-col gap-2">
        <Link
          href="/dashboard/settings"
          className={getItemClassName(activeItem === "conta")}
        >
          Minha conta
        </Link>

        <Link
          href="/dashboard/settings/seguranca"
          className={getItemClassName(activeItem === "seguranca")}
        >
          Seguranca
        </Link>

        {isAdmin ? (
          <Link
            href="/dashboard/settings/usuarios"
            className={getItemClassName(activeItem === "usuarios")}
          >
            Usuarios
          </Link>
        ) : null}

        <button className={getItemClassName(false)}>
          Notificacoes
        </button>
      </nav>
    </aside>
  );
}
