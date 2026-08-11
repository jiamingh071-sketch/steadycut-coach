import { describe, expect, it } from "vitest";
import { createDefaultSnapshot } from "../domain/types";
import { decryptBackup, encryptBackup } from "./backup";

describe("加密备份", () => {
  it("AES-GCM往返保留数据", async () => {
    const snapshot = createDefaultSnapshot(new Date("2026-08-01T00:00:00Z"));
    snapshot.profile.name = "测试用户";
    const encrypted = await encryptBackup(snapshot, "strong-pass-123");
    expect(encrypted.cipher.name).toBe("AES-GCM");
    expect(encrypted.ciphertext).not.toContain("测试用户");
    const restored = await decryptBackup(JSON.stringify(encrypted), "strong-pass-123");
    expect(restored.profile.name).toBe("测试用户");
  });

  it("错误密码与旧版本给出可理解错误", async () => {
    const encrypted = await encryptBackup(createDefaultSnapshot(), "strong-pass-123");
    await expect(decryptBackup(JSON.stringify(encrypted), "wrong-pass-123")).rejects.toThrow("密码错误或备份文件已损坏");
    await expect(decryptBackup(JSON.stringify({ ...encrypted, version: 1 }), "strong-pass-123")).rejects.toThrow("版本不受支持");
  });
});
