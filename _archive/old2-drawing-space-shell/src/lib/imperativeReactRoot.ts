import { createRoot, type Root } from "react-dom/client";

/**
 * Imperative React root for editor hosts (outside the app tree).
 * Recreates the root when the container element changes — reusing a root
 * on a detached DOM node leaves a blank viewport.
 */
export function createImperativeRootController() {
  let root: Root | null = null;
  let boundContainer: HTMLElement | null = null;

  function detachRoot() {
    if (!root) return;
    try {
      root.render(null);
    } catch {
      // ignore
    }
  }

  function destroyRootSync() {
    if (!root) return;
    try {
      root.unmount();
    } catch {
      // ignore
    }
    root = null;
    boundContainer = null;
  }

  return {
    getRoot(): Root | null {
      return root;
    },

    render(container: HTMLElement, renderFn: (active: Root) => void) {
      if (boundContainer !== container) {
        destroyRootSync();
        boundContainer = container;
        root = createRoot(container);
      }
      if (!root) {
        boundContainer = container;
        root = createRoot(container);
      }
      renderFn(root);
    },

    /** Detach UI; keep root only if the same container will remount (Strict Mode). */
    clear() {
      detachRoot();
    },

    /** Deferred full teardown — effect cleanups when leaving the editor view. */
    destroy() {
      const active = root;
      root = null;
      boundContainer = null;
      if (!active) return;
      queueMicrotask(() => {
        try {
          active.unmount();
        } catch {
          // ignore
        }
      });
    },

    /** Immediate teardown — switching editor implementation. */
    destroySync() {
      destroyRootSync();
    },
  };
}
