export type DirectorDeskNotificationTone = "error" | "success";

type DirectorDeskNotificationHandler = (
  message: string,
  tone: DirectorDeskNotificationTone
) => void;

let notificationHandler: DirectorDeskNotificationHandler | null = null;

export function setDirectorDeskNotificationHandler(handler?: DirectorDeskNotificationHandler) {
  notificationHandler = handler ?? null;
}

export function clearDirectorDeskNotificationHandler() {
  notificationHandler = null;
}

export function notifyDirectorDeskHost(
  message: string,
  tone: DirectorDeskNotificationTone = "error"
) {
  if (!notificationHandler) return false;
  notificationHandler(message, tone);
  return true;
}
