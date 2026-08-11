import { useCallback, useEffect, useRef, useState } from "react";
import type { AppSnapshot } from "../domain/types";
import { loadSnapshot, replaceSnapshot, saveSnapshot } from "../lib/storage";

export function useSnapshot() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [error, setError] = useState<string>("");
  const saveQueue = useRef(Promise.resolve());

  useEffect(() => {
    loadSnapshot().then(setSnapshot).catch((reason) => setError(reason instanceof Error ? reason.message : "无法读取本地数据"));
  }, []);

  const update = useCallback((mutator: (draft: AppSnapshot) => void) => {
    setSnapshot((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      mutator(next);
      next.updatedAt = new Date().toISOString();
      saveQueue.current = saveQueue.current.then(() => saveSnapshot(next)).catch((reason) => setError(reason instanceof Error ? reason.message : "保存失败"));
      return next;
    });
  }, []);

  const replace = useCallback(async (next: AppSnapshot) => {
    await replaceSnapshot(next);
    setSnapshot(structuredClone(next));
  }, []);

  return { snapshot, update, replace, error, clearError: () => setError("") };
}
