const dataChartBar = {
    // Dados fictícios para os gráficos
    regimeTributario: {
        data: [
            { category: "simples", value: 27, fill: "var(--color-simples)" },
            { category: "presumido", value: 20, fill: "var(--color-presumido)" },
            { category: "real", value: 18, fill: "var(--color-real)" },
            { category: "mei", value: 17, fill: "var(--color-mei)" },
        ],
        
        config: {
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
    },

    atividadesPrincipais: {

        data: [
            { category: "servico", value: 85, fill: "var(--color-servico)" },
            { category: "industria", value: 115, fill: "var(--color-industria)" },
            { category: "comercio", value: 100, fill: "var(--color-comercio)" },
        ],

        config: {
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
    },

    empresasAtivasPorSetor: {

        data: [
            { category: "fiscal", value: 60, fill: "var(--color-fiscal)" },
            { category: "contabil", value: 100, fill: "var(--color-contabil)" },
            { category: "pessoal", value: 45, fill: "var(--color-pessoal)" },
        ],

        
        config: {
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
    },

    responsaveis: {
        data: [
            { category: "thais", value: 25, fill: "var(--color-thais)" },
            { category: "carla", value: 25, fill: "var(--color-carla)" },
            { category: "fernando", value: 15, fill: "var(--color-fernando)" },
            { category: "pedroArthur", value: 10, fill: "var(--color-pedroArthur)" },
        ],

        config: {
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
    }
}

export default dataChartBar;