import { Header } from "../../components/layout/header";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltipContent, ChartTooltip} from "@/components/ui/chart";
import { ChartBarMixed } from "./components/chartBar";
import { ChartAreaInteractive } from "./components/chartArea";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import dataChartBar from "./components/dataChartBar";

export default async function dashboard() {
    const user = await getCurrentUser();

    if (!user) return redirect("/")

    return (
        <div>
            <Header/>
            <h1 className=" text-xl md:text-3xl m-2 mt-4 font-medium px-8">Dashboard</h1>
            <div className="md:grid grid-cols-2 gap-8 m-2 mt-2 p-8 w-auto h-auto">
                {/* Primeira Coluna */}
                <ChartBarMixed
                    nome="Regime Tributário"
                    descricao="Empresas por regime tributário"
                    config={dataChartBar.regimeTributario.config}
                    data={dataChartBar.regimeTributario.data}
                />

                <ChartBarMixed
                    nome="Atividades Principais"
                    descricao="Empresas por atividade principal"
                    config={dataChartBar.atividadesPrincipais.config}
                    data={dataChartBar.atividadesPrincipais.data}
                />

                {/* Segunda Coluna */}
                <ChartBarMixed
                    nome="Empresas Ativas"
                    descricao="Quantidade de empresas ativas por setor"
                    config={dataChartBar.empresasAtivasPorSetor.config}
                    data={dataChartBar.empresasAtivasPorSetor.data}
                />

                <ChartBarMixed
                    nome="Responsáveis"
                    descricao="Quantidade de empresas por responsável"
                    config={dataChartBar.responsaveis.config}
                    data={dataChartBar.responsaveis.data}
                />

            </div>
        </div>
    );
}