// @ts-ignore
import { log } from "erp-core:component/host";

export const execute = (input: string): string => {
    // input = JSON with action params
    return JSON.stringify({ success: true, data: null });
};
