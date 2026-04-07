import type { WebSocket } from "ws";

// Tracks authenticated WebSocket connections keyed by user_id.
// A Set per user handles multiple tabs/devices for the same account.
const clients = new Map<string, Set<WebSocket>>();

export function registerClient(userId: string, ws: WebSocket): void {
  if (!clients.has(userId)) {
    clients.set(userId, new Set());
  }
  clients.get(userId)?.add(ws);
}

export function removeClient(userId: string, ws: WebSocket): void {
  const sockets = clients.get(userId);
  if (!sockets) return;
  sockets.delete(ws);
  if (sockets.size === 0) clients.delete(userId);
}

export function sendToUser(userId: string, payload: object): void {
  const sockets = clients.get(userId);
  if (!sockets) return;
  const message = JSON.stringify(payload);
  for (const ws of sockets) {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
    }
  }
}
