import type { ServerFile } from "@/types/file";
import { TempFileStorage, tempRecordToServerFile } from "./TempFileStorage";

export function listTempFilesAsServerFiles(): ServerFile[] {
  return TempFileStorage.list().map(tempRecordToServerFile);
}
