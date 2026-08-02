export type VersionInfo = {
    tag: string;
    label?: string;
    description?: string;
};

export const CURRENT_VERSION: VersionInfo = {
    tag: "dev",
};
