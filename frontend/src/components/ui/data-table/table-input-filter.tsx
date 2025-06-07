import type { ComponentProps } from "solid-js"
import { splitProps } from "solid-js"

import type { Column } from "@tanstack/solid-table"

import { TextField, TextFieldInput } from "~/components/ui/text-field"

type TableInputFilterProps<TData> = ComponentProps<typeof TextFieldInput> & {
    column?: Column<TData>
}

export function TableInputFilter<TData>(props: TableInputFilterProps<TData>) {
    const [local, others] = splitProps(props, ["column"])
    return (
        <TextField
            value={(local.column?.getFilterValue() as string) ?? ""}
            onChange={(value) => local.column?.setFilterValue(value)}
        >
            <TextFieldInput {...others} />
        </TextField>
    )
}