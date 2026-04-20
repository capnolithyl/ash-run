/**
 * Lightweight event emitter used to decouple the controller, DOM views,
 * and Phaser scenes without bringing in a framework.
 */
export function createEmitter() {
  const listeners = new Map();

  return {
    on(eventName, handler) {
      const eventListeners = listeners.get(eventName) ?? new Set();
      eventListeners.add(handler);
      listeners.set(eventName, eventListeners);

      return () => {
        eventListeners.delete(handler);
      };
    },

    emit(eventName, payload) {
      const eventListeners = listeners.get(eventName);

      if (!eventListeners) {
        return;
      }

      for (const handler of eventListeners) {
        handler(payload);
      }
    }
  };
}

