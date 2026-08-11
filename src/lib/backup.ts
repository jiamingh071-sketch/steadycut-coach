import type { AppSnapshot } from "../domain/types";

export interface BackupEnvelope {
  format: "steadycut-backup";
  version: 2;
  createdAt: string;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: string };
  cipher: { name: "AES-GCM"; iv: string };
  ciphertext: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ITERATIONS = 210_000;

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((value) => (binary += String.fromCharCode(value)));
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

async function deriveKey(passphrase: string, salt: Uint8Array, usages: KeyUsage[]) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

export async function encryptBackup(snapshot: AppSnapshot, passphrase: string): Promise<BackupEnvelope> {
  if (passphrase.length < 8) throw new Error("备份密码至少需要8个字符");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(snapshot)),
  );
  return {
    format: "steadycut-backup",
    version: 2,
    createdAt: new Date().toISOString(),
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: ITERATIONS, salt: bytesToBase64(salt) },
    cipher: { name: "AES-GCM", iv: bytesToBase64(iv) },
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptBackup(contents: string, passphrase: string): Promise<AppSnapshot> {
  let envelope: BackupEnvelope;
  try {
    envelope = JSON.parse(contents) as BackupEnvelope;
  } catch {
    throw new Error("备份文件不是有效的 SteadyCut 文件");
  }
  if (envelope.format !== "steadycut-backup" || envelope.version !== 2) throw new Error("备份版本不受支持");
  try {
    const salt = base64ToBytes(envelope.kdf.salt);
    const iv = base64ToBytes(envelope.cipher.iv);
    const key = await deriveKey(passphrase, salt, ["decrypt"]);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      base64ToBytes(envelope.ciphertext),
    );
    const snapshot = JSON.parse(decoder.decode(plain)) as AppSnapshot;
    if (snapshot.version !== 2 || !snapshot.profile || !Array.isArray(snapshot.workoutSessions)) {
      throw new Error("解密后的数据结构不兼容");
    }
    return snapshot;
  } catch (error) {
    if (error instanceof Error && error.message.includes("不兼容")) throw error;
    throw new Error("密码错误或备份文件已损坏");
  }
}

export function downloadBackup(envelope: BackupEnvelope, date = new Date().toISOString().slice(0, 10)) {
  const blob = new Blob([JSON.stringify(envelope)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `SteadyCut-${date}.steadycut`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
