export function createLogger({ module = "server" } = {}) {
  const prefix = `[drawing-space:${module}]`;
  return {
    debug(message, data) {
      if (process.env.LOG_LEVEL === "debug") {
        console.debug(prefix, message, data ?? "");
      }
    },
    info(message, data) {
      console.info(prefix, message, data ?? "");
    },
    warn(message, data) {
      console.warn(prefix, message, data ?? "");
    },
    error(message, data) {
      console.error(prefix, message, data ?? "");
    },
  };
}
