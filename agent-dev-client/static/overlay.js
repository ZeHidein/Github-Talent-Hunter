function createErrorOverlay(errors) {
  const overlay = document.createElement('div');
  overlay.id = 'esbuild-error-overlay';
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
  overlay.style.fontFamily = '"Consolas", "Menlo", "Monaco", monospace';

  const container = document.createElement('div');
  container.style.backgroundColor = '#202020';
  container.style.color = '#e0e0e0';
  container.style.padding = '30px';
  container.style.borderRadius = '0';
  container.style.overflowY = 'auto';
  container.style.boxShadow = '0 0 20px rgba(0,0,0,0.7)';
  container.style.borderTop = '4px solid #ef625b';
  container.style.position = 'absolute';
  container.style.inset = '30px';
  container.style.margin = 'auto';

  errors.forEach((error) => {
    const errorContainer = document.createElement('div');
    errorContainer.style.marginBottom = '20px';
    errorContainer.style.border = '1px solid #553333';
    errorContainer.style.padding = '15px';
    errorContainer.style.backgroundColor = '#333842';
    errorContainer.style.borderRadius = '4px';

    const errorTitle = document.createElement('div');
    errorTitle.style.color = '#ef625b';
    errorTitle.style.fontWeight = 'bold';
    errorTitle.style.marginBottom = '10px';

    const messageParts = error.text.split(': ');
    if (messageParts.length > 1) {
      const firstPart = messageParts.shift();
      if (firstPart.startsWith('[') && firstPart.endsWith(']')) {
        errorTitle.textContent = firstPart;
      } else {
        errorTitle.textContent = 'Error';
        messageParts.unshift(firstPart);
      }
    } else {
      errorTitle.textContent = 'Error';
    }
    errorContainer.appendChild(errorTitle);

    const errorText = document.createElement('pre');
    errorText.textContent = messageParts.join(': ');
    errorText.style.whiteSpace = 'pre-wrap';
    errorText.style.margin = '0';
    errorText.style.color = '#cdd2da';
    errorText.style.fontSize = '0.95em';

    if (error.location) {
      const locationText = document.createElement('div');
      locationText.textContent = `${error.location.file}:${error.location.line}:${error.location.column}`;
      locationText.style.fontSize = '0.9em';
      locationText.style.color = '#88aaff';
      locationText.style.marginTop = '10px';
      errorContainer.appendChild(locationText);
    }

    if (error.detail && typeof error.detail === 'string') {
      const frameContainer = document.createElement('pre');
      frameContainer.style.backgroundColor = '#20232a';
      frameContainer.style.padding = '10px';
      frameContainer.style.marginTop = '10px';
      frameContainer.style.borderRadius = '4px';
      frameContainer.style.overflowX = 'auto';
      frameContainer.textContent = error.detail;
      errorContainer.appendChild(frameContainer);
    }

    errorContainer.appendChild(errorText);
    container.appendChild(errorContainer);
  });

  overlay.appendChild(container);
  document.body.appendChild(overlay);

  return () => {
    if (overlay.parentNode) {
      document.body.removeChild(overlay);
    }
  };
}

window.createErrorOverlay = createErrorOverlay;
