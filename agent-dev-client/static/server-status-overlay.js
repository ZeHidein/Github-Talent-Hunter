function createServerStatusOverlay(status) {
  const statusToText = {
    stopped: 'Server is stopped',
    build_in_progress: 'Server is building...',
    starting: 'Server is starting...',
    started: 'Server is running...',
    crashed: 'Server crashed',
  };

  const overlay = document.createElement('div');
  overlay.id = 'esbuild-server-status-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'transparent';
  overlay.style.zIndex = '9999';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  // overlay.style.fontFamily = '"Consolas", "Menlo", "Monaco", monospace';

  const container = document.createElement('div');
  container.style.backgroundColor = 'white';
  container.style.color = '#bbbbbb';
  container.style.padding = '30px';
  container.style.borderRadius = '0';
  container.style.position = 'absolute';
  container.style.inset = '0px';
  container.style.margin = 'auto';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.alignItems = 'center';
  container.style.justifyContent = 'center';

  const statusText = document.createElement('div');
  statusText.style.fontSize = '16px';
  statusText.style.textAlign = 'center';
  statusText.textContent = statusToText[status];

  overlay.appendChild(container);
  container.appendChild(statusText);

  document.body.appendChild(overlay);

  return () => {
    if (overlay.parentNode) {
      document.body.removeChild(overlay);
    }
  };
}

window.createErrorOverlay = createErrorOverlay;
