import {ColumnDef} from "@tanstack/solid-table"
import {Accessor, Show} from "solid-js";
import {Spinner, SpinnerType} from "solid-spinner";
import {DataTable, FilterSetupProps} from "~/components/data-table/data-table";
import MainLayout from "~/components/MainLayout";
import {tableMetaDescription} from "~/lib/og-meta";
import {AccessorProp} from "~/lib/table-utils/base";

interface TableLayoutProps<TData> {
    title: string;
    items: Accessor<TData[] | undefined>
    idAccessor?: AccessorProp<TData, any>
    colDefs: {
        columns: ColumnDef<TData>[]
        facetedFilters?: FilterSetupProps<TData, any>[]
        searchColumns?: string[]
    }
}


export default function TableLayout<TData>(props: TableLayoutProps<TData>) {
    return (
        <MainLayout
            title={props.title}
            description={tableMetaDescription(props.title, props.items()?.length)}
            keywords={`bitcraft, ${props.title.toLowerCase()}`}
        >
            <Show when={props.items()} fallback={
                <Spinner type={SpinnerType.ballTriangle} class="mx-auto mt-25%"/>
            }>
                {(data) => (
                    <DataTable
                        name={props.title}
                        data={data()}
                        idAccessor={props.idAccessor ?? {accessorKey: "id"} as AccessorProp<TData, any>}
                        columns={props.colDefs.columns}
                        facetedFilters={props.colDefs.facetedFilters}
                        searchColumns={props.colDefs.searchColumns}
                    />
                )}
            </Show>
        </MainLayout>
    )
}