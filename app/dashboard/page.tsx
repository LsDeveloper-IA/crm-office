"use client";

import { Header } from "../../components/layout/header";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltipContent, ChartTooltip} from "@/components/ui/chart";
import { ChartBarMixed } from "./components/chartBar";
import { ChartAreaInteractive } from "./components/chartArea";

export default function Dashboard() {
    const chartConfig = {
        value: {
            label: "Vendas Mensais",
            color: "blue",
            axis: "y",
        },

        mes: {
            label: "mês"
        }
    }

    const dados = [
        { month: "Jan", value: 5},
        { month: "Fev", value: 10},
        { month: "Mar", value: 15},
        { month: "Abr", value: 30},
        { month: "Mai", value: 25},
        { month: "Jun", value: 5},
        { month: "Jul", value: 15},
        { month: "Ago", value: 25},
        { month: "Set", value: 35},
        { month: "Out", value: 20},
        { month: "Nov", value: 2},
        { month: "Dez", value: 30},
    ]

    return (
        <div>
            <Header/>
            <h1 className="text-3xl m-2 mt-4 font-medium">Dashboard</h1>
            <div className="grid grid-cols-2 gap-4 m-2 mt-7">
                {/* <div className="p-4 rounded-lg shadow-md border-1 border-gray-200">
                    <h1 className="mx-10 mb-5 text-xl font-medium">Renda Mensal</h1>
                    <ChartContainer config={chartConfig} className="mt-2 w-150 h-100">
                        <BarChart data={dados}>
                            <XAxis dataKey="month"  tickLine={false} axisLine={false}/>
                            <YAxis tickLine={false} axisLine={false}/>
                            <Bar dataKey={"value"} fill="gray" radius={1}/>
                            <ChartTooltip content={<ChartTooltipContent />} />
                        </BarChart>
                    </ChartContainer>
                    
                </div>
                <div className="p-4 rounded-lg shadow-md border-1 border-gray-200">
                    <h1 className="mx-10 mb-5 text-xl font-medium">Despesas</h1>
                    <ChartContainer config={chartConfig} className="mt-2 w-150 h-100">
                        <BarChart data={dados}>
                            <XAxis dataKey="month"  tickLine={false} axisLine={false}/>
                            <YAxis tickLine={false} axisLine={false}/>
                            <Bar dataKey={"value"} fill="gray" radius={1}/>
                            <ChartTooltip content={<ChartTooltipContent />} />
                        </BarChart>
                    </ChartContainer>
                </div> */}

                {/* Primeira Coluna */}
                <ChartBarMixed
                    nome="Regime Tributário"
                    descricao="Empresas por regime tributário"
                />

                <ChartBarMixed
                    nome="Atividades Principais"
                    descricao="Empresas por atividade principal"
                />

                {/* Segunda Coluna */}
                <ChartBarMixed
                    nome="Empresas Ativas"
                    descricao="Quantidade de empresas ativas por setor"
                />

                <ChartBarMixed
                    nome="Responsáveis"
                    descricao="Quantidade de empresas por responsável"
                />

            </div>
        </div>
    );
}