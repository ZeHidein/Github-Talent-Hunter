/**
 * Live Reload and Development Tools
 * Handles hot reloading, error overlays, and log collection for development
 * This is system file critical for development, do NOT modify it.
 */

// =============================================================================
// LOG COLLECTION MODULE
// =============================================================================

const LogCollector = {
  // Configuration
  BATCH_INTERVAL: 3000,

  // State
  originalConsoleMethods: {},
  logBatch: [],
  capturedLogs: [],
  serverLogs: [],
  batchTimer: null,
  isOverridden: false,

  // Initialize log collection
  init() {
    this.overrideConsoleMethods();
    this.setupGlobalErrorHandlers();
    this.setupPageUnloadHandler();
    this.exposeGlobalMethods();
    this.setupMessageListener();
    this.setupServerLogListener();
  },

  setupMessageListener() {
    window.addEventListener('message', (event) => {
      if (event.data.type === 'agent-get-logs-request') {
        const logs = this.getCapturedLogs();
        const parentWindow = event.source;
        parentWindow.postMessage(
          {
            type: 'agent-logs-response',
            logs: JSON.stringify(logs),
            serverStatus: HotReload.getServerStatus(),
          },
          event.origin || '*',
        );
      }
    });
  },

  // Setup global error handlers to catch unhandled errors
  setupGlobalErrorHandlers() {
    window.addEventListener('error', (event) => {
      const errorInfo = {
        level: 'error',
        message: `Uncaught Error: ${event.error?.message || event.message}\n${
          event.error?.stack || ''
        }`,
        timestamp: Date.now(),
      };
      this.addLogToBatch(errorInfo);
      this.capturedLogs.push(errorInfo);
    });

    // Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const errorInfo = {
        level: 'error',
        message: `Unhandled Promise Rejection: ${
          event.reason?.message || event.reason
        }\n${event.reason?.stack || ''}`,
        timestamp: Date.now(),
      };
      this.addLogToBatch(errorInfo);
      this.capturedLogs.push(errorInfo);
    });
  },

  setupServerLogListener() {
    const serverLogSource = createResilientEventSource('/__agentplace/dev/build', {
      name: 'server-logs',
      maxDelayMs: 30000,
    });

    serverLogSource.addEventListener('logs', (e) => {
      const data = JSON.parse(e.data);
      const logs = data.logs || [];

      if (logs.length > 0) {
        this.serverLogs.push(...logs);
      }
      if (this.serverLogs.length >= 1000) {
        this.serverLogs = this.serverLogs.slice(this.serverLogs.length - 1000);
      }
    });
  },

  // Format a single value using sprintf-js if available, fallback to custom logic
  formatValue(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';

    if (value instanceof Error) {
      return `${value.name}: ${value.message}\n${value.stack || ''}`;
    }

    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value === 'function') return `[Function: ${value.name || 'anonymous'}]`;

    // Use sprintf-js if available (loaded as static script)
    if (typeof window.sprintf !== 'undefined') {
      try {
        return window.sprintf.sprintf('%j', value);
      } catch {
        return '[Object]';
      }
    }

    // Fallback to JSON.stringify
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return '[Object]';
    }
  },

  formatConsoleArgs(args) {
    if (args.length === 0) return '';

    const first = args[0];

    if (args.length === 1) {
      return this.formatValue(first);
    }

    // Check if first argument is a template string and sprintf is available
    if (
      typeof first === 'string' &&
      /%[sdifjoO%]/.test(first) &&
      typeof window.sprintf !== 'undefined'
    ) {
      try {
        return window.sprintf.vsprintf(first, args.slice(1));
      } catch (error) {
        return args.map((arg) => this.formatValue(arg)).join(' ');
      }
    }

    return args.map((arg) => this.formatValue(arg)).join(' ');
  },

  overrideConsoleMethods() {
    if (this.isOverridden) return;

    const logLevels = ['log', 'warn', 'error', 'info', 'debug'];

    logLevels.forEach((level) => {
      this.originalConsoleMethods[level] = console[level];
      console[level] = (...args) => {
        const formattedMessage = this.formatConsoleArgs(args);

        const logEntry = {
          level,
          message: formattedMessage,
          timestamp: Date.now(),
        };

        // Add to both batch (for backend) and captured logs (for iframe communication)
        this.addLogToBatch(logEntry);
        this.capturedLogs.push(logEntry);

        this.originalConsoleMethods[level]?.apply(console, args);
      };
    });

    this.isOverridden = true;
  },

  // Restore original console methods
  restoreConsoleMethods() {
    if (!this.isOverridden) return;

    const logLevels = ['log', 'warn', 'error', 'info', 'debug'];
    logLevels.forEach((level) => {
      if (this.originalConsoleMethods[level]) {
        console[level] = this.originalConsoleMethods[level];
        delete this.originalConsoleMethods[level];
      }
    });

    this.isOverridden = false;
  },

  // Get captured logs (for iframe communication)
  getCapturedLogs() {
    return [
      ...this.capturedLogs.map((log) => ({ ...log, source: 'client' })),
      ...this.serverLogs.map((log) => ({ ...log, source: 'server' })),
    ];
  },

  // Clear captured logs
  clearCapturedLogs() {
    this.capturedLogs = [];
  },

  // Add log to batch and schedule sending
  addLogToBatch(log) {
    this.logBatch.push(log);

    if (this.batchTimer === null) {
      this.batchTimer = setTimeout(() => {
        this.sendLogBatch();
      }, this.BATCH_INTERVAL);
    }
  },

  // Send batched logs to backend
  sendLogBatch() {
    if (this.logBatch.length === 0) {
      this.batchTimer = null;
      return;
    }

    const logsToSend = [...this.logBatch];
    this.logBatch = [];
    this.batchTimer = null;

    fetch('/__agentplace/dev/logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'log-batch',
        logs: logsToSend,
      }),
    }).catch((err) => {
      this.originalConsoleMethods.error?.('Failed to send log batch to backend:', err);
      this.logBatch.unshift(...logsToSend);
    });
  },

  // Handle page unload to send remaining logs
  setupPageUnloadHandler() {
    window.addEventListener('beforeunload', () => {
      if (this.logBatch.length > 0) {
        const data = JSON.stringify({
          type: 'log-batch',
          logs: this.logBatch,
        });

        if (navigator.sendBeacon) {
          navigator.sendBeacon('/__agentplace/dev/logs', data);
        } else {
          this.sendLogBatch();
        }
      }
    });
  },

  // Expose global methods
  exposeGlobalMethods() {
    window.flushLogs = () => {
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
        this.batchTimer = null;
      }
      this.sendLogBatch();
    };

    window.LogCollectorAPI = {
      getCapturedLogs: () => this.getCapturedLogs(),
      clearCapturedLogs: () => this.clearCapturedLogs(),
      isOverridden: () => this.isOverridden,
      override: () => this.overrideConsoleMethods(),
      restore: () => this.restoreConsoleMethods(),
    };
  },
};

// =============================================================================
// HOT RELOAD MODULE
// =============================================================================

const HotReload = {
  // State
  changeSource: null,
  buildResultSource: null,
  removeOverlay: null,
  currentServerStatus: 'unknown',

  // Initialize hot reload functionality
  init() {
    this.setupBuildResultListener();
    this.setupServerStatusListener();
  },

  // Setup build result listener
  setupBuildResultListener() {
    this.buildResultSource = createResilientEventSource('/__agentplace/dev/build', {
      name: 'build-results',
      maxDelayMs: 30000,
    });

    this.buildResultSource.addEventListener('build-result', (e) => {
      console.log('👀 Build result received:', e);
      const result = JSON.parse(e?.data ?? '{}');

      if (result.errors?.length) {
        this.showErrorOverlay(result.errors);
      } else if (result.source === 'server') {
        // Clear server logs when build result is received from server
        this.serverLogs = [];
      } else if (result.source === 'client') {
        this.reloadPage();
      }
    });
  },

  // Setup server status listener
  setupServerStatusListener() {
    if (!this.buildResultSource) {
      console.warn('[HotReload] Build result source not available for server status');
      return;
    }

    this.buildResultSource.addEventListener('serverStatus', (e) => {
      try {
        const data = JSON.parse(e?.data ?? '{}');
        const { status, timestamp, type } = data;

        if (status) {
          const previousStatus = this.currentServerStatus;
          this.currentServerStatus = status;

          console.log(`🔌 Server status: ${previousStatus} -> ${status}`, {
            timestamp,
            type: type || 'update',
          });

          this.handleServerStatusChange(status, previousStatus);
        }
      } catch (error) {
        console.error('[HotReload] Error parsing server status:', error);
      }
    });
  },

  handleServerStatusChange(newStatus, previousStatus) {
    switch (newStatus) {
      case 'starting':
        console.log('🔄 Server is starting...');
        this.showServerStatusOverlay(newStatus);
        break;
      case 'started':
        console.log('✅ Server is ready');
        // this.showServerStatusOverlay(newStatus);
        if (previousStatus !== 'unknown') {
          this.reloadPage();
        }
        break;
      case 'build_in_progress':
        console.log('🔨 Server build in progress...');
        this.showServerStatusOverlay(newStatus);
        break;
      case 'crashed':
        console.log('💥 Server crashed');
        this.showServerStatusOverlay(newStatus);
        break;
      case 'stopped':
        console.log('⏹️ Server stopped');
        // this.showServerStatusOverlay(newStatus);
        break;
      default:
        console.log(`📡 Server status: ${newStatus}`);
    }
  },

  // Get current server status
  getServerStatus() {
    return this.currentServerStatus;
  },

  shouldReloadCSS(added, removed, updated) {
    return !added.length && !removed.length && updated.length === 1;
  },

  reloadCSS(updatedPath) {
    for (const link of document.getElementsByTagName('link')) {
      const url = new URL(link.href);

      if (url.host === location.host && url.pathname === updatedPath) {
        const next = link.cloneNode();
        next.href = updatedPath + '?' + Math.random().toString(36).slice(2);
        next.onload = () => link.remove();
        link.parentNode.insertBefore(next, link.nextSibling);
        return;
      }
    }
    this.reloadPage();
  },

  // Reload the entire page
  reloadPage() {
    location.reload();
  },

  // Show error overlay
  showErrorOverlay(errors) {
    const createErrorOverlay = window.createErrorOverlay;

    if (this.removeOverlay) {
      this.removeOverlay();
    }

    if (typeof createErrorOverlay === 'function') {
      this.removeOverlay = createErrorOverlay(errors);
    } else {
      console.error('createErrorOverlay is not defined. Make sure overlay.js is loaded.');
    }
  },

  showServerStatusOverlay(status) {
    if (this.removeOverlay) {
      this.removeOverlay();
    }

    const createServerStatusOverlay = window.createServerStatusOverlay;
    if (typeof createServerStatusOverlay === 'function') {
      this.removeOverlay = createServerStatusOverlay(status);
    } else {
      console.error(
        'createServerStatusOverlay is not defined. Make sure server-status-overlay.js is loaded.',
      );
    }
  },

  // Cleanup resources
  cleanup() {
    if (this.changeSource) {
      this.changeSource.close();
    }
    if (this.buildResultSource) {
      this.buildResultSource.close();
    }
    if (this.removeOverlay) {
      this.removeOverlay();
    }
  },
};

// =============================================================================
// INITIALIZATION - Run immediately, don't wait for DOMContentLoaded
// =============================================================================

// Resilient EventSource wrapper with exponential backoff + jitter.
// Native EventSource will often reconnect, but it can get stuck if the server
// returns non-SSE content or transient errors. This makes failures visible and recoverable.
function createResilientEventSource(url, { name, baseDelayMs = 500, maxDelayMs = 15000 } = {}) {
  let es = null;
  let attempt = 0;
  let reconnectTimer = null;
  let closedByUs = false;

  const logPrefix = name ? `[EventSource:${name}]` : '[EventSource]';

  const cleanup = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (es) {
      es.onopen = null;
      es.onerror = null;
      try {
        es.close();
      } catch {}
      es = null;
    }
  };

  const scheduleReconnect = () => {
    if (closedByUs) return;
    if (reconnectTimer) return;

    attempt += 1;
    const exp = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
    const jitter = Math.floor(Math.random() * 250);
    const delay = Math.min(maxDelayMs, exp + jitter);

    console.warn(`${logPrefix} disconnected; reconnecting in ${delay}ms (attempt ${attempt})`);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      open();
    }, delay);
  };

  const open = () => {
    cleanup();
    try {
      es = new EventSource(url);
    } catch (err) {
      console.error(`${logPrefix} failed to construct EventSource`, err);
      scheduleReconnect();
      return;
    }

    es.onopen = () => {
      attempt = 0;
      console.log(`${logPrefix} connected`);
    };

    es.onerror = (err) => {
      // Some browsers spam onerror during normal reconnect; we still force a clean reconnect
      // if the connection is CLOSED.
      try {
        const state = es ? es.readyState : -1; // 0 CONNECTING, 1 OPEN, 2 CLOSED
        if (state === 2) {
          scheduleReconnect();
        }
      } catch {}
      // Keep a breadcrumb regardless
      console.warn(`${logPrefix} error`, err);
    };
  };

  open();

  // Return the EventSource instance, but monkey-patch close() so callers can intentionally stop it.
  const proxy = {
    addEventListener: (...args) => es && es.addEventListener(...args),
    removeEventListener: (...args) => es && es.removeEventListener(...args),
    close: () => {
      closedByUs = true;
      cleanup();
    },
    get readyState() {
      return es ? es.readyState : 2;
    },
  };

  return proxy;
}

// Initialize log collection immediately
LogCollector.init();

// Initialize hot reload when DOM is ready (for EventSource connections)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    HotReload.init();
  });
} else {
  HotReload.init();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  HotReload.cleanup();
});

// Expose modules globally for debugging
window.DevTools = {
  LogCollector,
  HotReload,
  getServerStatus: () => HotReload.getServerStatus(),
};
