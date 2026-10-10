// AsyncLocalStorage ของ simulator (/testline, /demo) — แยกไฟล์ไว้เพื่อให้ model/service ใดๆ
// เช็ค sim context ได้โดยไม่เกิด circular import (เช่น lineService ↔ LineMessageLog)
import { AsyncLocalStorage } from "node:async_hooks";

export const simCtx = new AsyncLocalStorage(); // store: { sink(kind, args) }
export const inSimContext = () => !!simCtx.getStore();
