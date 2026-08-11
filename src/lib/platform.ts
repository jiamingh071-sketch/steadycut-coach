import { Capacitor } from "@capacitor/core";

export const isNative = () => Capacitor.isNativePlatform();

let deferredInstall: BeforeInstallPromptEvent | null = null;

declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  }
}

export function setupPwaInstall(onAvailable?: (available: boolean) => void) {
  const handler = (event: Event) => {
    event.preventDefault();
    deferredInstall = event as BeforeInstallPromptEvent;
    onAvailable?.(true);
  };
  window.addEventListener("beforeinstallprompt", handler);
  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
    onAvailable?.(false);
  });
  return () => window.removeEventListener("beforeinstallprompt", handler);
}

export async function requestPwaInstall(): Promise<"installed" | "dismissed" | "manual"> {
  if (!deferredInstall) return "manual";
  await deferredInstall.prompt();
  const result = await deferredInstall.userChoice;
  deferredInstall = null;
  return result.outcome === "accepted" ? "installed" : "dismissed";
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return null;
  try {
    return await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
  } catch (error) {
    console.warn("Service worker registration failed", error);
    return null;
  }
}

export async function notifyRestFinished() {
  // Native reminders are scheduled when the rest starts, so they still fire while locked.
  if (isNative()) return true;
  if (!("Notification" in window)) return false;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;
  new Notification("休息结束", { body: "检查动作设置，准备下一组。", icon: `${import.meta.env.BASE_URL}icons/icon.svg` });
  return true;
}

/** Schedules the native reminder at the actual rest end, before the app is locked. */
export async function scheduleRestNotification(restEndsAt: string, id: number) {
  if (!isNative()) return false;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const permission = await LocalNotifications.requestPermissions();
  if (permission.display !== "granted") return false;
  await LocalNotifications.schedule({
    notifications: [{
      id,
      title: "休息结束",
      body: "检查动作设置，准备下一组。",
      schedule: { at: new Date(restEndsAt), allowWhileIdle: true },
      sound: undefined,
    }],
  });
  return true;
}

export async function cancelRestNotification(id: number | null | undefined) {
  if (!isNative() || id === null || id === undefined) return false;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  await LocalNotifications.cancel({ notifications: [{ id }] });
  return true;
}

export async function hapticPulse(kind: "light" | "success" | "warning" = "light") {
  if (isNative()) {
    const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
    if (kind === "light") await Haptics.impact({ style: ImpactStyle.Light });
    else await Haptics.notification({ type: kind === "success" ? NotificationType.Success : NotificationType.Warning });
  } else if (navigator.vibrate) navigator.vibrate(kind === "warning" ? [100, 70, 100] : 70);
}

let wakeLock: WakeLockSentinel | null = null;
export async function setScreenAwake(enabled: boolean) {
  if (!("wakeLock" in navigator)) return false;
  if (enabled && !wakeLock) {
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
      return true;
    } catch { return false; }
  }
  if (!enabled && wakeLock) {
    await wakeLock.release();
    wakeLock = null;
  }
  return true;
}

export async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = value;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

export async function shareText(title: string, text: string) {
  if (isNative()) {
    const { Share } = await import("@capacitor/share");
    await Share.share({ title, text, dialogTitle: title });
    return true;
  }
  if (navigator.share) {
    await navigator.share({ title, text });
    return true;
  }
  return copyText(text);
}
