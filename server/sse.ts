import { Response } from "express";

const clients = new Map<string, Set<Response>>();

export function addSSEClient(userId: string, res: Response): void {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(res);
}

export function removeSSEClient(userId: string, res: Response): void {
  const userClients = clients.get(userId);
  if (userClients) {
    userClients.delete(res);
    if (userClients.size === 0) clients.delete(userId);
  }
}

export function pushToUser(userId: string, data: object): void {
  const userClients = clients.get(userId);
  if (!userClients || userClients.size === 0) return;
  const message = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of userClients) {
    try {
      res.write(message);
    } catch {
      userClients.delete(res);
    }
  }
}
