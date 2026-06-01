const routes = new Map();

function normalizePath(path = window.location.pathname) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return normalizedPath.replace(/\/+$/, "") || "/";
}

function getRouteHandler(path) {
  return routes.get(normalizePath(path)) || routes.get("*") || null;
}

export function registerRoute(path, render) {
  if (typeof render !== "function") {
    throw new TypeError("Route render handler must be a function");
  }

  routes.set(normalizePath(path), render);
}

export function getCurrentPath() {
  return normalizePath();
}

export function renderRoute(path = getCurrentPath()) {
  const handler = getRouteHandler(path);

  if (!handler) {
    return null;
  }

  return handler({
    path: normalizePath(path),
    params: new URLSearchParams(window.location.search),
  });
}

export function navigateTo(path, state = {}) {
  const nextPath = normalizePath(path);

  if (nextPath === getCurrentPath()) {
    return renderRoute(nextPath);
  }

  window.history.pushState(state, "", nextPath);
  return renderRoute(nextPath);
}

export function initRouter() {
  window.addEventListener("popstate", () => {
    renderRoute();
  });

  return renderRoute();
}
