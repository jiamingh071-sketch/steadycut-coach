const CHANNEL_NAME = "steadycut-session-lock";

export interface SessionLock {
  sessionId: string;
  owner: string;
  updatedAt: number;
}

export function createSessionLock(onConflict: (lock: SessionLock) => void) {
  const owner = crypto.randomUUID();
  const channel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null;
  let active: SessionLock | null = null;

  channel?.addEventListener("message", (event: MessageEvent<SessionLock>) => {
    const incoming = event.data;
    if (active && incoming.sessionId === active.sessionId && incoming.owner !== owner && Date.now() - incoming.updatedAt < 12_000) {
      onConflict(incoming);
    }
  });

  const heartbeat = window.setInterval(() => {
    if (!active) return;
    active.updatedAt = Date.now();
    channel?.postMessage(active);
  }, 4_000);

  return {
    owner,
    acquire(sessionId: string) {
      active = { sessionId, owner, updatedAt: Date.now() };
      channel?.postMessage(active);
    },
    release() { active = null; },
    destroy() {
      window.clearInterval(heartbeat);
      channel?.close();
    },
  };
}
