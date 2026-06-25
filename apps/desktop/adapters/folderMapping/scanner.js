import { FolderMappingSidecar } from "./sidecar.js";

export function scanWorkspace(workspacePath) {
  const sidecar = new FolderMappingSidecar(workspacePath);
  return sidecar.load();
}
