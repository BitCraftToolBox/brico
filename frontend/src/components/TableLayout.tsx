import {ColumnDef} from "@tanstack/solid-table"
import {Accessor, Show} from "solid-js";
import {Spinner, SpinnerType} from "solid-spinner";
import {DataTable, FilterSetupProps} from "~/components/data-table/data-table";
import MainLayout from "~/components/MainLayout";

interface TableLayoutProps<TData> {
    title: string;
    items: Accessor<TData[] | undefined>
    colDefs: {
        columns: ColumnDef<TData>[]
        facetedFilters?: FilterSetupProps<TData>[]
        searchColumns?: string[]
    }
}


export default function TableLayout<TData>(props: TableLayoutProps<TData>) {
    return (
        <MainLayout title={props.title}>
            <Show when={props.items()} fallback={
                <Spinner type={SpinnerType.ballTriangle} class="mx-auto mt-25%"/>
            }>
                {(data) => (
                    <DataTable
                        name={props.title}
                        data={data()}
                        columns={props.colDefs.columns}
                        facetedFilters={props.colDefs.facetedFilters}
                        searchColumns={props.colDefs.searchColumns}
                    />
                )}
            </Show>
        </MainLayout>
    )
}