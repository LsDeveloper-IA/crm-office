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
        sort: params.get("sort") ?? null,
        dir: params.get("dir") ?? null,
        group: params.get("group") ?? null,
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

        if(!response.ok) {
            console.error("Erro ao gerar planilha");
            return;
        }
        
        const blob = await response.blob();

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "empresas.xlsx";
        a.click();
    }

    const hasSelectedFields = Object.values(filters).some(Boolean);

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
                        {fields.map((fields) => {
                            const isActive = filters[fields.key as keyof SheetFilters];

                            return (
                                <label
                                    key={fields.key}
                                    className={`
                                        group
                                        relative
                                        flex items-center 
                                        px-4 py-2 pl-6 rounded-lg border
                                        cursor-pointer transition-all
                                        text-sm font-medium 
                                        ${isActive 
                                            ? 'bg-blue-600 text-white border-blue-600' 
                                            : 'bg-gray-200 border-gray-300 hover:bg-blue-400'
                                        }
                                    `}
                                >
                                    <span
                                        className={`
                                            absolute left-0 top-0
                                            h-full w-1.5
                                            rounded-l-lg
                                            transition-all duration-200
                                            ${isActive
                                                ? "bg-blue-800"
                                                : "bg-gray-400 group-hover:bg-blue-600"
                                            }
                                        `}
                                    />

                                    <input
                                        type="checkbox"
                                        checked={isActive}
                                        className="hidden"
                                        onChange={(e) =>
                                            setFilters(prev => ({
                                                ...prev,
                                                [fields.key]: e.target.checked
                                            }))
                                        }
                                    />
                                    {fields.label}
                                </label>
                            );
                        })}
                    </div>
                </div>

                <div className="mx-auto my-2 h-px w-[95%] bg-gray-200" />

                <div className="px-6 pb-5 mx-auto">

                    <button
                        className={`w-80 h-10 border rounded-md font-medium ${!hasSelectedFields ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'hover:bg-gray-200 transition-colors cursor-pointer'}`}
                        disabled={!hasSelectedFields}
                        onClick={handleGenerate}
                    >
                        Gerar planilha
                    </button>
                </div>
            </div>
        </div>
    );
}