"use cliente";

import { Header } from "../../components/layout/header";
import { DataTable } from "./components/dataTables";
import { columns, Payment } from "./components/column"

async function getData(): Promise<Payment[]> {
    return [
        {
            id: "1",
            amount: 100,
            status: "success",
            email: "exampleOne@gmail.com",
        },
        {
            id: "2",
            amount: 1000,
            status: "processing",
            email: "exampleTwo@gmail.com",
        },
        {
            id: "3",
            amount: 1200,
            status: "failed",
            email: "exampleThree@gmail.com",
        },
        {
            id: "4",
            amount: 1050,
            status: "success",
            email: "exampleFour@gmail.com",
        },
    ]
}

export default async function tables() {
    const data = await getData();

    return (
        <div>
            <Header/>
            <h1 className="md:text-3xl text-xl m-2 mt-4 font-medium">Tables</h1>
            <div className="w-full h-full p-2">
                <DataTable columns={columns} data={data}/>
            </div>
        </div>
    )
}