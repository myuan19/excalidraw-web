export default class MindMap {
  constructor(options = {}) {
    this.options = options;
    this.data = options.data ?? {};
    this.handlers = new Map();
  }

  getData() {
    return this.data;
  }

  setFullData(data) {
    this.data = data;
  }

  destroy() {
    this.handlers.clear();
  }

  execCommand() {}

  on(eventName, handler) {
    this.handlers.set(eventName, handler);
  }

  off(eventName) {
    this.handlers.delete(eventName);
  }
}
