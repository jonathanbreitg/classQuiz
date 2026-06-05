const routes = [];
let currentCleanup = null;

export function route(pattern, handler) {
  routes.push({ pattern, handler });
}

export function navigate(path) {
  window.location.hash = '#' + path;
}

function matchPattern(pattern, path) {
  const paramNames = [];
  const regexStr = pattern.replace(/:([^/]+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  const match = path.match(new RegExp(`^${regexStr}$`));
  if (!match) return null;
  const params = {};
  paramNames.forEach((name, i) => { params[name] = match[i + 1]; });
  return params;
}

function dispatch() {
  const path = window.location.hash.slice(1) || '/';
  if (currentCleanup) { currentCleanup(); currentCleanup = null; }

  const container = document.getElementById('app');
  container.innerHTML = '';

  for (const { pattern, handler } of routes) {
    const params = matchPattern(pattern, path);
    if (params !== null) {
      container.scrollTop = 0;
      const cleanup = handler(container, params);
      currentCleanup = typeof cleanup === 'function' ? cleanup : null;
      return;
    }
  }

  container.innerHTML = '<div class="error-page"><h2>Page not found</h2></div>';
}

export function startRouter() {
  window.addEventListener('hashchange', dispatch);
  dispatch();
}
