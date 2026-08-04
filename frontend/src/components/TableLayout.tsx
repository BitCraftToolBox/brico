import {useLocation} from "@solidjs/router";
import {ColumnDef} from "@tanstack/solid-table"
import {Accessor, Show} from "solid-js";
import {Spinner, SpinnerType} from "solid-spinner";
import {DataTable, FilterSetupProps} from "~/components/data-table/data-table";
import MainLayout from "~/components/MainLayout";
import {breadcrumbCurrent} from "~/lib/game-links";
import {Label, labelSource, useLabel} from "~/lib/labels";
import {BITCRAFT_TITLE_SUFFIX, tableMetaDescription} from "~/lib/og-meta";
import {BreadcrumbJsonLd} from "~/lib/structured-data";
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
    const location = useLocation();
    const title = () => label(props.title);
    // Stable English identity for the persisted hidden-column/session key — must not shift with
    // the display locale, unlike the MainLayout/Nav title below.
    const name = labelSource(props.title);
    // Every TableLayout page is mounted at exactly the href its sidebar entry points at, so the
    // path *is* the breadcrumb's own href — no per-page plumbing needed. `props.title` is already
    // that entry's label, so passing it as the override keeps the two from drifting.
    return (
        <>
            <BreadcrumbJsonLd href={location.pathname} titleOverride={props.title}/>
            <MainLayout
                title={title()}
                titleSuffix={BITCRAFT_TITLE_SUFFIX}
                description={tableMetaDescription(title(), props.items()?.length)}
                keywords={`bitcraft, ${title().toLowerCase()}`}
                navTitle={breadcrumbCurrent(location.pathname, props.title)}
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
        </>
    )
}