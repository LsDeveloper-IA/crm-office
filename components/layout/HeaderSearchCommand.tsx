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
    kind: "company" | "partner";
    partnerId?: number;
    cpf?: string | null;
    companyName?: string | null;
    year?: number;
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
    const [searchError, setSearchError] = useState<string | null>(null);

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
        setSearchError(null);

        // se vazio, limpa
        if (q.length < 2) {
            setItems([]);
            setLoading(false);
            abortRef.current?.abort();
            return;
        }

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setItems([]);
        setLoading(true);

        const t = setTimeout(async () => {

            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=12`, {
                    signal: controller.signal,
                    cache: "no-store",
                });

                if (!res.ok) throw new Error("Falha ao buscar empresas");
                const data = (await res.json()) as { items: CompanySearchItem[] };

                if (!controller.signal.aborted) setItems(data.items ?? []);
            } catch (err: unknown) {
                if (controller.signal.aborted) return;
                if (err instanceof DOMException && err.name === "AbortError") return;
                setItems([]);
                setSearchError("Não foi possível pesquisar. Tente novamente.");
            }
            finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }, 200); // debounce 200ms

        return () => { clearTimeout(t); controller.abort(); };
    }, [query, open]);

    function openResult(item: CompanySearchItem) {
        if (item.kind === "partner") {
            const params = new URLSearchParams({ company: item.cnpj, partner: String(item.partnerId) });
            params.set("focus", String(Date.now()));
            if (item.year) params.set("year", String(item.year));
            router.push(`/dashboard/distribuicao-lucros?${params}`);
            onOpenChange(false);
        } else void openCompany(item.cnpj);
    }

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
            <DialogOverlay className="bg-black/50 backdrop-blur-sm" />

            <DialogContent className="p-0 overflow-hidden max-w-2xl">
                <Command className="w-full" shouldFilter={false}>
                    <CommandInput
                        value={query}
                        onValueChange={setQuery}
                        placeholder="Pesquisar empresa ou sócio por nome, CNPJ ou CPF..."
                    />
                    <CommandList className="max-h-[360px]">
                        <CommandEmpty>
                            {loading ? "Buscando..." : searchError ?? (query.trim().length < 2
                                ? "Digite pelo menos dois caracteres." : "Nenhum resultado encontrado.")}
                        </CommandEmpty>

                        <CommandGroup heading="Empresas e sócios">
                            {items.map((c) => (
                                <CommandItem
                                    key={`${c.kind}-${c.cnpj}-${c.partnerId ?? ""}`}
                                    value={`${c.kind}-${c.cnpj}-${c.partnerId ?? ""}`}
                                    onSelect={() => openResult(c)}
                                    className="flex items-center justify-between"
                                >
                                    <span className="truncate">
                                        {c.name ?? "-"}{c.kind === "partner" && <span className="block text-xs text-muted-foreground">{c.companyName ?? c.cnpj}</span>}
                                    </span>

                                    <span className="font-mono text-xs text-muted-foreground">
                                        {c.cpf ?? c.cnpj}
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
