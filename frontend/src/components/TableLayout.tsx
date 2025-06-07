import {Accessor, Suspense} from "solid-js";
import MainLayout from "~/components/MainLayout";
import {ColumnDef} from "@tanstack/solid-table"
import {Spinner, SpinnerType} from "solid-spinner";
import {DataTable, FilterSetupProps} from "~/components/ui/data-table/data-table";

interface TableLayoutProps<TData> {
    title: string;
    items: Accessor<TData[] | undefined>
    cols: ColumnDef<TData>[]
    facetedFilters?: FilterSetupProps<TData>[]
    searchColumn?: string
}


export default function TableLayout<TData>(props: TableLayoutProps<TData>) {
    return (
        <MainLayout title={props.title}>
            <Suspense fallback={<Spinner type={SpinnerType.ballTriangle} class="mx-auto mt-25%"></Spinner>}>
                <DataTable data={props.items() || []}
                           columns={props.cols}
                           facetedFilters={props.facetedFilters}
                           searchColumn={props.searchColumn}
                >
                </DataTable>
            </Suspense>
        </MainLayout>
    )
}