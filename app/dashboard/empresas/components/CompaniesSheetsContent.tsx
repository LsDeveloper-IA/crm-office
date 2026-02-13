"use client";

import ClipboardIcon from "@/components/icons/ClipboardIcon";
import { useState } from "react";

type ModalProps = {
    isOpen: boolean;
    onClose: () => void;
    searchParams: any;
}

type SheetFilters = {
    nome: boolean;
    cnpj: boolean;
    decimoTerceiro: boolean;
    honorario: boolean;
    regime: boolean;
    contador: boolean;
    responsaveis: boolean;
    socios: boolean;
    atividades: boolean;
    todasAsEmpresas: boolean;
}

const fields = [
    { label: "Nome", key: "nome" },
    { label: "Cnpj", key: "cnpj" },
    { label: "13°", key: "decimoTerceiro" },
    { label: "Honorário", key: "honorario" },
    { label: "Regime Tributário", key: "regime" },
    { label: "Contador", key: "contador" },
    { label: "Resposáveis", key: "responsaveis" },
    { label: "Sócios", key: "socios" },
    { label: "Atividades", key: "atividades" },
    { label: "Todas as Empresas", key: "todasAsEmpresas" },
]

export function CompaniesSheetsContent({ isOpen, onClose, searchParams}: ModalProps) {
    const params = searchParams;

    const paramsObject = {
        page: params.get("page") ?? null,
    }
    
    const [filters, setFilters] = useState<SheetFilters>({
        nome: false,
        cnpj: false,
        decimoTerceiro: false,
        honorario: false,
        regime: false,
        contador:  false,
        responsaveis: false,
        socios: false,
        atividades: false,
        todasAsEmpresas: false,
    });

    // Só para testes, retirar depois!!!
    const handleGenerate = async () => {
        const response = await fetch("/api/sheets", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                filters,
                paramsObject,
            })
        })
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />

            <div className="relative w-[520px] h-[370px] bg-white rounded-md shadow-lg flex flex-col">
                <div className="flex flex-row px-6 pt-5">
                    <h2 className="flex-1 text-lg font-semibold text-gray-800">
                        Configurar Dados para a Planilha
                    </h2>
                    <ClipboardIcon className={"text-[#8181A5] rounded-md p-0.5"}/>
                </div>

                <div className="mx-auto my-2 mx h-px w-[95%] bg-gray-200" />

                <div className="flex-1 px-6 py-4 overflow-y-auto">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        {fields.map((fields) => (
                            <label
                                key={fields.key}
                                className="flex items-center gap-2 text-md text-gray-700 cursor-pointer"
                            >
                                <input
                                    type="checkbox"
                                    checked={filters[fields.key as keyof SheetFilters]}
                                    className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                                    onChange={(e) =>
                                        setFilters(prev => ({
                                            ...prev,
                                            [fields.key]: e.target.checked
                                        }))
                                    }
                                />
                                {fields.label}
                            </label>
                        ))}
                    </div>
                </div>

                <div className="mx-auto my-2 h-px w-[95%] bg-gray-200" />

                <div className="px-6 pb-5 mx-auto">

                    <button
                        className="w-80 h-10 border rounded-md font-medium hover:bg-gray-200 transition-colors cursor-pointer"
                        onClick={handleGenerate}
                    >
                        Gerar planilha
                    </button>
                </div>
            </div>
        </div>
    );
}