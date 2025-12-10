"use cliente";

import { Header } from "../../components/layout/header";
import { DataTable } from "./dataTables";
import { columns, Payment } from "./column"

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
            id: "1",
            amount: 1050,
            status: "success",
            email: "exampleFour@gmail.com",
        },
    ]
}

export default async function Tabels() {
    const data = await getData();

    return (
        <div>
            <Header/>
            <h1 className="text-3xl m-2 mt-4 font-medium">Tables</h1>
            <div className="w-fulll h-full p-2">
                <DataTable columns={columns} data={data}/>
            </div>
        </div>
    )
}