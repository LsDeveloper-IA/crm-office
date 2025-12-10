"use client";

import { Header } from "../../components/layout/header";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltipContent, ChartTooltip} from "@/components/ui/chart";
import { ChartBarMixed } from "./components/chartBar";
import { ChartAreaInteractive } from "./components/chartArea";

export default function Dashboard() {

    // Dados fictícios para os gráficos
    const chartDataRegimeTributario = [
        { category: "simples", value: 27, fill: "var(--color-simples)" },
        { category: "presumido", value: 20, fill: "var(--color-presumido)" },
        { category: "real", value: 18, fill: "var(--color-real)" },
        { category: "mei", value: 17, fill: "var(--color-mei)" },
    ]

    const chartDataAtividadesPrincipais = [
        { category: "servico", value: 85, fill: "var(--color-servico)" },
        { category: "industria", value: 115, fill: "var(--color-industria)" },
        { category: "comercio", value: 100, fill: "var(--color-comercio)" },
    ]

    const chartDataEmpresasAtivasPorSetor = [
        { category: "fiscal", value: 60, fill: "var(--color-fiscal)" },
        { category: "contabil", value: 100, fill: "var(--color-contabil)" },
        { category: "pessoal", value: 45, fill: "var(--color-pessoal)" },
    ]

    const chartDataResponsaveis = [
        { category: "thais", value: 25, fill: "var(--color-thais)" },
        { category: "carla", value: 25, fill: "var(--color-carla)" },
        { category: "fernando", value: 15, fill: "var(--color-fernando)" },
        { category: "pedroArthur", value: 10, fill: "var(--color-pedroArthur)" },
    ]

    // Configurações dos gráficos
    const chartConfigRegimeTributario = {
        value: {
            label: "Empresas",
        },
        simples: {
            label: "Simples",
            color: "var(--color-neutral-200)",
        },
        presumido: {
            label: "Presumido",
            color: "var(--color-neutral-400)",
        },
        real: {
            label: "Real",
            color: "var(--color-neutral-600)",
        },
        mei: {
            label: "MEI",
            color: "var(--color-neutral-800)",
        },
    }

    const chartConfigAtividadesPrincipais = {
        value: {
            label: "Empresas",
        },
        servico: {
            label: "Serviço",
            color: "var(--color-neutral-200)",
        },
        industria: {
            label: "Indústria",
            color: "var(--color-neutral-400)",
        },
        comercio: {
            label: "Comércio",
            color: "var(--color-neutral-600)",
        },
    }

    const chartConfigEmpresasAtivasPorSetor = {
        value: {
            label: "Empresas",
        },
        fiscal: {
            label: "Fiscal",
            color: "var(--color-neutral-200)",
        },
        contabil: {
            label: "Contábil",
            color: "var(--color-neutral-400)",
        },
        pessoal: {
            label: "Pessoal",
            color: "var(--color-neutral-600)",
        },
    }

    const chartConfigResponsaveis = {
        value: {
            label: "Empresas",
        },
        thais: {
            label: "Thais",
            color: "var(--color-neutral-200)",
        },
        carla: {
            label: "Carla",
            color: "var(--color-neutral-400)",
        },
        fernando: {
            label: "Fernando",
            color: "var(--color-neutral-600)",
        },
        pedroArthur: {
            label: "Pedro Arthur",
            color: "var(--color-neutral-800)",
        },
    }

    return (
        <div>
            <Header/>
            <h1 className=" text-xl md:text-3xl m-2 mt-4 font-medium px-8">Dashboard</h1>
            <div className="md:grid grid-cols-2 gap-8 m-2 mt-2 p-8 w-auto h-auto">
                {/* Primeira Coluna */}
                <ChartBarMixed
                    nome="Regime Tributário"
                    descricao="Empresas por regime tributário"
                    config={chartConfigRegimeTributario}
                    data={chartDataRegimeTributario}
                />

                <ChartBarMixed
                    nome="Atividades Principais"
                    descricao="Empresas por atividade principal"
                    config={chartConfigAtividadesPrincipais}
                    data={chartDataAtividadesPrincipais}
                />

                {/* Segunda Coluna */}
                <ChartBarMixed
                    nome="Empresas Ativas"
                    descricao="Quantidade de empresas ativas por setor"
                    config={chartConfigEmpresasAtivasPorSetor}
                    data={chartDataEmpresasAtivasPorSetor}
                />

                <ChartBarMixed
                    nome="Responsáveis"
                    descricao="Quantidade de empresas por responsável"
                    config={chartConfigResponsaveis}
                    data={chartDataResponsaveis}
                />

            </div>
        </div>
    );
}