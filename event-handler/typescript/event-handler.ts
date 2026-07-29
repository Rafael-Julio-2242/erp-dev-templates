export const onEvent = (entity: string, trigger: string, data: string): string => {
    // trigger = "created" | "updated" | "deleted"
    return JSON.stringify({ success: true });
};
