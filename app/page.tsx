"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";

const loginSchema = z.object({
  username: z
    .string()
    .min(1, "O Email é obrigatório")
    .email("Formato de email inválido"),

  password: z
  .string().min(1, "Senha é obrigatória"),
});

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    // 🔎 1. Validação Zod
    const parsed = loginSchema.safeParse({ username, password });

    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Erro ao fazer login.");
        setLoading(false);
        return;
      }

      // Sucesso -> cookie httpOnly já foi definido pelo servidor
      router.push("/dashboard");
    } catch (err) {
      console.error("Login request failed", err);
      setError("Erro de rede. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <>
      {/* Background gradient */}
      <div
        className="absolute top-0 left-0 bottom-0 leading-5 h-full w-full overflow-hidden 
          bg-[#030142] bg-linear-to-b from-[#02022a] to-[#030142]"
      />

      <div className="relative min-h-screen flex items-center justify-center">
        <div className="hidden lg:flex flex-col text-gray-300 mr-12">
          <h1 className="my-3 font-semibold text-4xl">CRM - Office</h1>
          <p className="pr-3 text-sm opacity-75">
            Bem-vindo ao CRM da Assessoria Office Contábil, seu controle de clientes.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="z-10"
          aria-label="Formulário de login"
        >
          <div className="p-12 bg-white mx-auto rounded-3xl w-96 shadow-lg">
            <div className="mb-7">
              <h3 className="font-semibold text-2xl text-gray-800">Entrar</h3>

              {error && (
                <div className="text-red-600 text-sm text-center mt-2" role="alert">
                  {error}
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div>
                <label htmlFor="username" className="sr-only">
                  Usuário
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  className="w-full text-sm px-4 py-3 bg-gray-200 focus:bg-gray-100 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-900"
                  placeholder="Email"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="sr-only">
                  Senha
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  className="w-full text-sm px-4 py-3 bg-gray-200 focus:bg-gray-100 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-900"
                  placeholder="Senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full flex justify-center items-center bg-blue-800 hover:bg-blue-600 text-gray-100 p-3 rounded-lg tracking-wide font-semibold transition ease-in duration-200 ${
                    loading ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                >
                  {loading ? "Entrando..." : "Entrar"}
                </button>
              </div>

              <div className="mt-7 text-center text-gray-500 text-xs">
                <span>
                  Copyright © 2025 - 2026{" "}
                  <a
                    href="https://lsdeveloper.dev"
                    rel="noopener noreferrer"
                    target="_blank"
                    title="LS Developer"
                    className="text-blue-500 hover:text-blue-600"
                  >
                    LS
                  </a>
                </span>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Decorative SVG */}
      <svg
        className="absolute bottom-0 left-0"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1440 320"
        aria-hidden
      >
        <path
          fill="#fff"
          fillOpacity="1"
          d="M0,0L40,42.7C80,85,160,171,240,197.3C320,224,400,192,480,154.7C560,117,640,75,720,74.7C800,75,880,117,960,154.7C1040,192,1120,224,1200,213.3C1280,203,1360,149,1400,122.7L1440,96L1440,320L1400,320C1360,320,1280,320,1200,320C1120,320,1040,320,960,320C880,320,800,320,720,320C640,320,560,320,480,320C400,320,320,320,240,320C160,320,80,320,40,320L0,320Z"
        ></path>
      </svg>
    </>
  );
}