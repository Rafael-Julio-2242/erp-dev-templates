// @ts-ignore
import { log } from "erp-core:component/host";

export const start = (): string => {
    log("info", "module started");
    return JSON.stringify({ success: true, data: null, message: "ok" });
};
export const stop = (): string => JSON.stringify({ success: true });
export const callRoutine = (_name: string, _input: string): string =>
    JSON.stringify({ success: false, message: "not implemented" });
export const callEndpoint = (_name: string, _method: string, _path: string, _body: string, _headers: string): string =>
    JSON.stringify({ success: false, message: "not implemented" });
export const callEvent = (_name: string, _trigger: string, _entity: string, _data: string): string =>
    JSON.stringify({ success: false, message: "not implemented" });
