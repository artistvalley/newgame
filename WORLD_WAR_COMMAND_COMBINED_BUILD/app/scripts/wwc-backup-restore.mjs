import { cp, rm } from "node:fs/promises";

export async function backupDir(source, destination) {
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true });
}

export async function restoreDir(backup, destination) {
  await rm(destination, { recursive: true, force: true });
  await cp(backup, destination, { recursive: true });
}
