import {ColumnDef} from "@tanstack/solid-table"
import {Accessor, Show} from "solid-js";
import {Spinner, SpinnerType} from "solid-spinner";
import {DataTable, FilterSetupProps} from "~/components/data-table/data-table";
import MainLayout from "~/components/MainLayout";
import {Label, labelSource, useLabel} from "~/lib/labels";
import {tableMetaDescription} from "~/lib/og-meta";
import {AccessorProp} from "~/lib/table-utils/base";

interface TableLayoutProps<TData> {
    title: Label | string;
    items: Accessor<TData[] | undefined>
    idAccessor?: AccessorProp<TData, any>
    colDefs: {
        columns: ColumnDef<TData>[]
        facetedFilters?: FilterSetupProps<TData, any>[]
        searchColumns?: string[]
    }
}


export default function TableLayout<TData>(props: TableLayoutProps<TData>) {
    const label = useLabel();
    const title = () => label(props.title);
    // Stable English identity for the persisted hidden-column/session key — must not shift with
    // the display locale, unlike the MainLayout/Nav title below.
    const name = labelSource(props.title);
    return (
        <MainLayout
            title={title()}
            description={tableMetaDescription(title(), props.items()?.length)}
            keywords={`bitcraft, ${title().toLowerCase()}`}
        >
            <Show when={props.items()} fallback={
                <Spinner type={SpinnerType.ballTriangle} class="mx-auto mt-25%"/>
            }>
                {(data) => (
                    <DataTable
                        name={name}
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