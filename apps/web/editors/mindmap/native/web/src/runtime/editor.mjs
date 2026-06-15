import MindMap from "simple-mind-map";
import Export from "simple-mind-map/src/plugins/Export.js";
import RichText from "simple-mind-map/src/plugins/RichText.js";

MindMap.usePlugin(RichText);
MindMap.usePlugin(Export);

const NATIVE_SOURCE = "simple-mind-map-native";

/** @type {MindMap | null} */
let nativeMindMap = null;
let revision = 0;
let draftPushTimer = null;
let suppressDraftPushUntil = 0;

function postToHost(type, payload = {}) {
  window.parent?.postMessage({ source: NATIVE_SOURCE, type, ...payload }, "*");
}

function normalizeTheme(theme) {
  if (typeof theme === "string") {
    return theme;
  }
  if (theme && typeof theme === "object" && typeof theme.template === "string") {
    return theme.template;
  }
  return "default";
}

function normalizeDocumentData(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      root: {
        data: { text: "<p>MindMap</p>", richText: true, expand: true },
        children: [],
      },
      theme: "default",
      layout: "logicalStructure",
    };
  }
  const record = /** @type {Record<string, unknown>} */ (raw);
  const nested =
    record.data && typeof record.data === "object" ? record.data : record;
  const doc = /** @type {Record<string, unknown>} */ (nested);
  return {
    root: doc.root,
    layout: typeof doc.layout === "string" ? doc.layout : "logicalStructure",
    theme: normalizeTheme(doc.theme),
    view: doc.view ?? null,
    config: doc.config,
  };
}

function extractInitData(message) {
  if (!message || typeof message !== "object") {
    return null;
  }
  const record = /** @type {Record<string, unknown>} */ (message);
  if (record.type === "init" && record.data) {
    return normalizeDocumentData(record.data);
  }
  if (record.type === "initMindMap" && record.payload) {
    const payload = record.payload;
    if (payload && typeof payload === "object") {
      const payloadRecord = /** @type {Record<string, unknown>} */ (payload);
      if (payloadRecord.mindMapData) {
        return normalizeDocumentData(payloadRecord.mindMapData);
      }
      if (payloadRecord.data) {
        return normalizeDocumentData(payloadRecord.data);
      }
      return normalizeDocumentData(payloadRecord);
    }
  }
  if (record.type === "setMindMapData" && record.payload) {
    const payload = record.payload;
    if (payload && typeof payload === "object") {
      const payloadRecord = /** @type {Record<string, unknown>} */ (payload);
      if (payloadRecord.data) {
        return normalizeDocumentData(payloadRecord.data);
      }
      return normalizeDocumentData(payloadRecord);
    }
  }
  return normalizeDocumentData(record.data ?? record);
}

function exportDocumentData() {
  if (!nativeMindMap) {
    return null;
  }
  const raw = nativeMindMap.getData(true);
  return {
    root: raw.root,
    layout: raw.layout || "logicalStructure",
    theme: normalizeTheme(raw.theme),
    view: raw.view ?? null,
  };
}

async function exportThumbnailSvg() {
  if (!nativeMindMap) {
    return null;
  }
  try {
    return await nativeMindMap.export("svg", false, "MindMap");
  } catch {
    return null;
  }
}

function pushDocumentToHost({ requestId, includeThumbnail = false } = {}) {
  if (!nativeMindMap) {
    return;
  }
  const mindMapData = exportDocumentData();
  if (!mindMapData) {
    return;
  }
  revision += 1;
  const payload = {
    mindMapData,
    revision,
    requestId: requestId ?? null,
  };
  const send = async () => {
    if (includeThumbnail) {
      payload.thumbnail = await exportThumbnailSvg();
    }
    postToHost("saveMindMapData", { payload });
  };
  void send();
}

function scheduleDraftPush() {
  if (Date.now() < suppressDraftPushUntil) {
    return;
  }
  if (draftPushTimer !== null) {
    window.clearTimeout(draftPushTimer);
  }
  draftPushTimer = window.setTimeout(() => {
    draftPushTimer = null;
    pushDocumentToHost({ includeThumbnail: false });
  }, 450);
}

function destroyNativeMindMap() {
  if (nativeMindMap) {
    nativeMindMap.destroy();
    nativeMindMap = null;
  }
}

function mountNativeMindMap(container, data) {
  destroyNativeMindMap();
  container.innerHTML = "";
  const mount = document.createElement("div");
  mount.className = "mindmap-native-root";
  mount.style.width = "100%";
  mount.style.height = "100%";
  container.appendChild(mount);

  nativeMindMap = new MindMap({
    el: mount,
    data: data.root,
    layout: data.layout || "logicalStructure",
    theme: data.theme || "default",
    viewData: data.view ?? undefined,
    fit: true,
  });

  nativeMindMap.on("data_change", () => {
    scheduleDraftPush();
  });
  nativeMindMap.on("node_tree_render_end", () => {
    postToHost("appInited");
  });
  nativeMindMap.on("view_data_change", (view) => {
    postToHost("mindMapViewState", { payload: view });
  });

  postToHost("appInited");
}

export async function renderMindMap(container, message) {
  const data = extractInitData(message);
  if (!data?.root) {
    throw new Error("MindMap init payload missing root");
  }
  suppressDraftPushUntil = Date.now() + 800;
  mountNativeMindMap(container, data);
}

export function applyMindMapData(message) {
  if (!nativeMindMap) {
    return renderMindMap(document.getElementById("app"), message);
  }
  const data = extractInitData(message);
  if (!data) {
    return;
  }
  suppressDraftPushUntil = Date.now() + 800;
  nativeMindMap.setFullData({
    root: data.root,
    layout: data.layout,
    theme: { template: data.theme || "default" },
    view: data.view ?? undefined,
  });
}

export async function handleHostCommand(type, payload = {}) {
  if (type === "requestMindMapSave") {
    if (!nativeMindMap) {
      postToHost("mindMapIframeError", {
        message: "nativeMindMap not ready",
        ok: false,
        requestId: payload.requestId ?? null,
      });
      return;
    }
    await pushDocumentToHost({
      requestId: payload.requestId ?? null,
      includeThumbnail: true,
    });
    return;
  }
  if (type === "mindMapHostSaveStatus") {
    suppressDraftPushUntil = Date.now() + 600;
    return;
  }
  if (type === "restoreMindMapView" || type === "host_restore_preview_view") {
    nativeMindMap?.view?.fit();
    postToHost("mindMapViewRestoreDone", { payload: { ok: true } });
    postToHost("embed_preview_viewport_applied", { ok: true });
  }
}

export function isNativeReady() {
  return !!nativeMindMap;
}
