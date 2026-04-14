type Listener = () => void;
const listeners = new Set<Listener>();
let patched = false;

function emit(): void {
  for (const l of listeners) l();
}

function patchHistoryOnce(): void {
  if (typeof window === "undefined" || patched) return;
  patched = true;
  const { pushState, replaceState } = history;
  history.pushState = function (
    this: History,
    ...args: Parameters<History["pushState"]>
  ) {
    const r = pushState.apply(this, args);
    emit();
    return r;
  };
  history.replaceState = function (
    this: History,
    ...args: Parameters<History["replaceState"]>
  ) {
    const r = replaceState.apply(this, args);
    emit();
    return r;
  };
  window.addEventListener("popstate", emit);
}

export function subscribeNavigationStore(callback: Listener): () => void {
  listeners.add(callback);
  patchHistoryOnce();
  return () => {
    listeners.delete(callback);
  };
}

export function getNavigationStoreSnapshot(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}`;
}
