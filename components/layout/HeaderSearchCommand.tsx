"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter} from "next/navigation";

import {
    Dialog,
    DialogContent,
    DialogOverlay,
} from "@/components/ui/dialog";

import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";

type CompanySearchItem = {
    cnpj: string;
    name: string | null;
};

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export function HeaderSearchCommand({ open, onOpenChange }: Props) {
    const router = useRouter();

    const [query, setQuery] = useState("");
    const [items, setItems] = useState<CompanySearchItem[]>([]);
    const [loading, setLoading] = useState(false);

    const abortRef = useRef<AbortController | null>(null);

    // ✅ Atalhos: Cmd/Ctrl + K e Cmd/Ctrl + J
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const isCmdOrCtrl = e.metaKey || e.ctrlKey;
            const isK = e.key.toLowerCase() === "k";

            if (isCmdOrCtrl && (isK)) {
                e.preventDefault();
                onOpenChange(true);
            }

            if (e.key === "Escape") {
                onOpenChange(false);
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onOpenChange]);

    useEffect(() => {
        if (open) {
            setQuery("");
            setItems([]);
            setLoading(false);
        } else {
            abortRef.current?.abort();
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;

        const q = query.trim();

        // se vazio, limpa
        if (!q) {
            setItems([]);
            setLoading(false);
            abortRef.current?.abort();
            return;
        }

        setLoading(true);

        const t = setTimeout(async () => {
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            try {
                const res = await fetch(`/api/companies?q=${encodeURIComponent(q)}&limit=12`, {
                    signal: controller.signal,
                    cache: "no-store",
                });

                if (!res.ok) throw new Error("Falha ao buscar empresas");
                const data = (await res.json()) as { items: CompanySearchItem[] };

                setItems(data.items ?? []);
            } catch (err: unknown) {
                if (err instanceof DOMException && err.name === "AbortError") return;
                setItems([]);
            }
            finally {
                setLoading(false);
            }
        }, 200); // debounce 200ms

        return () => clearTimeout(t);
    }, [query, open]);

    async function openCompany(cnpj: string) {
        try {
            const res = await fetch(`/api/companies/page?cnpj=${encodeURIComponent(cnpj)}`, {
                cache: "no-store",
            });

            if (!res.ok) throw new Error("Falha ao calcular página da empresa");

            const data = (await res.json()) as { page: number };

            const params = new URLSearchParams();
            params.set("page", String(data.page));
            params.set("cnpj", cnpj);

            router.push(`/dashboard/empresas?${params.toString()}`);
            onOpenChange(false);
        } catch {
            // fallback: se der ruim, pelo menos abre a drawer na página atual
            const params = new URLSearchParams();
            params.set("cnpj", cnpj);
            router.push(`/dashboard/empresas?${params.toString()}`);
            onOpenChange(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* overlay com blur (igual tailwind palette) */}
            <DialogOverlay className="bg-black/50 backdrop-blur-sm" />

            <DialogContent className="p-0 overflow-hidden max-w-2xl">
                <Command className="w-full">
                    <CommandInput
                        value={query}
                        onValueChange={setQuery}
                        placeholder="Pesquisar empresa por nome ou CNPJ..."
                    />

                    <CommandList className="max-h-[360px]">
                        <CommandEmpty>
                            {loading ? "Buscando..." : "Nenhuma empresa encontrada."}
                        </CommandEmpty>

                        <CommandGroup heading="Empresas">
                            {items.map((c) => (
                                <CommandItem
                                    key={c.cnpj}
                                    value={`${c.name ?? ""} ${c.cnpj}`}
                                    onSelect={() => openCompany(c.cnpj)}
                                    className="flex items-center justify-between"
                                >
                                    <span className="truncate">
                                        {c.name ?? "-"}
                                    </span>

                                    <span className="font-mono text-xs text-muted-foreground">
                                        {c.cnpj}
                                    </span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </DialogContent>
        </Dialog>
    );
}
