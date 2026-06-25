import { scanCatalogAsync } from "./asyncScan.js";

import { logFilesOperation } from "./desktopFilesLog.mjs";

import {

  mergePartialScanCheckpoint,

  mergeScanCheckpoint,

} from "./mappingRootUtils.js";



const PASS_STAT = "stat-only";

const PASS_ENRICH = "pending-only";

/** watcher 触发的重扫合并窗口：避免 QQ/IDE 等连续写文件导致扫描永远无法完成。 */

const WATCHER_RESCAN_DEBOUNCE_MS = 3000;



function shouldDebounceRescan(reason) {

  const source = reason?.source;

  return source === "watcher" || source === "store.scheduleRescan";

}



export function createCatalogBackgroundScanner({ sidecar, onUpdated }) {

  let running = false;

  let queued = false;

  let generation = 0;

  let nextReason = null;

  let debounceTimer = null;

  let debouncedReason = null;

  let status = {

    state: "idle",

    pass: null,

    processed: 0,

    folders: 0,

    files: 0,

    error: null,

  };



  const notify = () => {

    if (typeof onUpdated === "function") {

      onUpdated({ ...status });

    }

  };



  const setStatus = (patch) => {

    status = { ...status, ...patch };

    notify();

  };



  const cancelDebounce = () => {

    if (debounceTimer) {

      clearTimeout(debounceTimer);

      debounceTimer = null;

    }

    debouncedReason = null;

  };



  const saveCheckpoint = (partial, options = {}) => {

    const current = sidecar.load();

    const isPartial = options.partial === true;

    const merged = isPartial

      ? mergePartialScanCheckpoint(partial, current)

      : mergeScanCheckpoint(partial, current);

    logFilesOperation("[DEBUG] catalog-scan | checkpoint", {

      partial: isPartial,

      partialFolders: partial.folders?.length ?? null,

      partialFiles: partial.files?.length ?? null,

      currentFolders: current.folders?.length ?? null,

      currentFiles: current.files?.length ?? null,

      mergedFolders: merged.folders?.length ?? null,

      mergedFiles: merged.files?.length ?? null,

      pendingFiles: (merged.files ?? []).filter((file) => file.scan_pending)

        .length,

    });

    sidecar.save(merged);

    notify();

  };



  const finishIdleFromMeta = () => {

    const meta = sidecar.load();

    setStatus({

      state: "idle",

      pass: null,

      processed: 0,

      folders: meta.folders?.length ?? 0,

      files: meta.files?.length ?? 0,

      error: null,

    });

  };



  const runOnce = async () => {

    const runId = ++generation;

    const runReason = nextReason;

    nextReason = null;

    running = true;

    setStatus({

      state: "running",

      pass: PASS_STAT,

      processed: 0,

      folders: 0,

      files: 0,

      error: null,

    });



    try {

      let meta = sidecar.load();

      logFilesOperation("[DEBUG] catalog-scan | pass-start", {

        runId,

        pass: PASS_STAT,

        trigger: runReason,

        roots: meta.mapping_roots?.length ?? 0,

        folders: meta.folders?.length ?? 0,

        files: meta.files?.length ?? 0,

      });

      if (!(meta.mapping_roots ?? []).length) {

        if (runId === generation) {

          finishIdleFromMeta();

        }

        return;

      }



      meta = await scanCatalogAsync(sidecar, meta, {

        contentMode: PASS_STAT,

        onProgress: (info) => {

          if (runId !== generation) {

            return;

          }

          setStatus({

            pass: PASS_STAT,

            processed: info.processed,

            folders: info.folders,

            files: info.files,

          });

        },

        onCheckpoint: (partial) => {

          if (runId !== generation) {

            return;

          }

          saveCheckpoint(partial, { partial: true });

        },

        shouldCancel: () => runId !== generation,

      });

      if (runId === generation) {

        logFilesOperation("[DEBUG] catalog-scan | pass-finish", {

          runId,

          pass: PASS_STAT,

          folders: meta.folders?.length ?? 0,

          files: meta.files?.length ?? 0,

          pendingFiles: (meta.files ?? []).filter((file) => file.scan_pending)

            .length,

        });

        saveCheckpoint(meta);

      }



      if (runId !== generation) {

        return;

      }



      meta = sidecar.load();

      if (!(meta.mapping_roots ?? []).length) {

        finishIdleFromMeta();

        return;

      }



      const pendingCount = (meta.files ?? []).filter((file) => file.scan_pending)

        .length;

      if (pendingCount > 0) {

        logFilesOperation("[DEBUG] catalog-scan | pass-start", {

          runId,

          pass: PASS_ENRICH,

          trigger: { source: "same-run-pending-only", previous: runReason },

          pendingFiles: pendingCount,

          folders: meta.folders?.length ?? 0,

          files: meta.files?.length ?? 0,

        });

        setStatus({ pass: PASS_ENRICH, processed: 0 });

        meta = await scanCatalogAsync(sidecar, meta, {

          contentMode: PASS_ENRICH,

          onProgress: (info) => {

            if (runId !== generation) {

              return;

            }

            setStatus({

              pass: PASS_ENRICH,

              processed: info.processed,

              folders: info.folders,

              files: info.files,

            });

          },

          onCheckpoint: (partial) => {

            if (runId !== generation) {

              return;

            }

            saveCheckpoint(partial, { partial: true });

          },

          shouldCancel: () => runId !== generation,

        });

        if (runId === generation) {

          logFilesOperation("[DEBUG] catalog-scan | pass-finish", {

            runId,

            pass: PASS_ENRICH,

            folders: meta.folders?.length ?? 0,

            files: meta.files?.length ?? 0,

            pendingFiles: (meta.files ?? []).filter((file) => file.scan_pending)

              .length,

          });

          saveCheckpoint(meta);

        }

      }



      if (runId === generation) {

        finishIdleFromMeta();

      }

    } catch (error) {

      if (runId !== generation) {

        return;

      }

      if (error?.code === "scan_cancelled") {

        if (!(sidecar.load().mapping_roots ?? []).length) {

          finishIdleFromMeta();

        }

        return;

      }

      setStatus({

        state: "error",

        pass: null,

        error: error instanceof Error ? error.message : String(error),

      });

    } finally {

      if (runId !== generation) {

        if (queued) {

          queued = false;

          running = false;

          void runOnce();

        } else {

          running = false;

        }

        return;

      }

      running = false;

      if (queued) {

        queued = false;

        void runOnce();

      }

    }

  };



  const scheduleImmediate = (reason) => {

    nextReason = reason ?? { source: "unknown" };

    logFilesOperation("[DEBUG] catalog-scan | schedule", {

      running,

      queued,

      generation,

      debounced: false,

      reason: nextReason,

    });

    if (running) {

      queued = true;

      return;

    }

    void runOnce();

  };



  const schedule = (reason = null) => {

    const resolved = reason ?? { source: "unknown" };

    if (running) {

      queued = true;

      nextReason = resolved;

      logFilesOperation("[DEBUG] catalog-scan | schedule", {

        running,

        queued,

        generation,

        debounced: false,

        coalescedWhileRunning: true,

        reason: resolved,

      });

      return;

    }

    if (shouldDebounceRescan(resolved)) {

      debouncedReason = resolved;

      if (debounceTimer) {

        clearTimeout(debounceTimer);

      }

      logFilesOperation("[DEBUG] catalog-scan | schedule", {

        running,

        queued,

        generation,

        debounced: true,

        debounceMs: WATCHER_RESCAN_DEBOUNCE_MS,

        reason: resolved,

      });

      debounceTimer = setTimeout(() => {

        debounceTimer = null;

        const pending = debouncedReason;

        debouncedReason = null;

        scheduleImmediate(pending);

      }, WATCHER_RESCAN_DEBOUNCE_MS);

      return;

    }

    cancelDebounce();

    scheduleImmediate(resolved);

  };



  return {

    getStatus() {

      return { ...status, running: running || queued || debounceTimer != null };

    },

    schedule,

    onMappingRootsChanged(reason = null) {

      cancelDebounce();

      nextReason = reason ?? { source: "mapping-roots-changed" };

      logFilesOperation("[DEBUG] catalog-scan | mapping-roots-changed", {

        running,

        queued,

        generation,

        reason: nextReason,

      });

      generation += 1;

      const roots = sidecar.load().mapping_roots ?? [];

      if (!roots.length) {

        queued = false;

        running = false;

        finishIdleFromMeta();

      } else if (running) {

        queued = true;

      } else {

        void runOnce();

      }

    },

  };

}

