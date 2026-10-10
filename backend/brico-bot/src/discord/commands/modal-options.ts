/**
 * modal-options.ts — reads field values from a `MODAL_SUBMIT` interaction, the counterpart of
 * `options.ts`. Fields arrive wrapped in `Label` components and are looked up by the inner
 * component's `custom_id`.
 */
import type {APIModalSubmission, ModalSubmitComponent} from "discord-api-types/v10";
import {ComponentType} from "discord-api-types/v10";

/** A `MentionableSelect` field's selected user or role, resolved from the submission's own `resolved` map. */
export interface ModalMentionable {
    type: "user" | "role";
    id: string;
    name: string;
}

/** Label-wrapped fields keyed by the inner component's `custom_id`. */
function fieldsByCustomId(submission: APIModalSubmission): Map<string, ModalSubmitComponent> {
    const fields = new Map<string, ModalSubmitComponent>();
    for (const component of submission.components) {
        if (component.type === ComponentType.Label) {
            fields.set(component.component.custom_id, component.component);
        }
    }
    return fields;
}

export function modalTextInputValue(submission: APIModalSubmission, customId: string): string | undefined {
    const field = fieldsByCustomId(submission).get(customId);
    return field?.type === ComponentType.TextInput ? field.value : undefined;
}

export function modalStringSelectValues(submission: APIModalSubmission, customId: string): readonly string[] {
    const field = fieldsByCustomId(submission).get(customId);
    return field?.type === ComponentType.StringSelect ? field.values : [];
}

/** The selected value of a single-select string select; `undefined` if none. */
export function modalStringSelectValue(submission: APIModalSubmission, customId: string): string | undefined {
    return modalStringSelectValues(submission, customId)[0];
}

export function modalCheckboxGroupValues(submission: APIModalSubmission, customId: string): readonly string[] {
    const field = fieldsByCustomId(submission).get(customId);
    return field?.type === ComponentType.CheckboxGroup ? field.values : [];
}

/** The selected mentionable; `undefined` if none or it isn't in `resolved`. */
export function modalMentionableSelectValue(submission: APIModalSubmission, customId: string): ModalMentionable | undefined {
    const field = fieldsByCustomId(submission).get(customId);
    const id = field?.type === ComponentType.MentionableSelect ? field.values[0] : undefined;
    if (!id) return undefined;
    const user = submission.resolved?.users?.[id];
    if (user) return {type: "user", id, name: user.global_name ?? user.username};
    const role = submission.resolved?.roles?.[id];
    if (role) return {type: "role", id, name: role.name};
    return undefined;
}
