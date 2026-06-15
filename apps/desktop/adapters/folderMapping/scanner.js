import { FolderMappingSidecar } from "./sidecar.js";

export function scanWorkspace(workspacePath) {
  return new FolderMappingSidecar(workspacePath).loadAndScan();
}
