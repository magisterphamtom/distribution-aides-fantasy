/**
 * Zoom & Pan sur les images — intégré à « Distribution d'aides de jeu »
 * (reprend le module « Zoom & Pan sur les images » de magisterphamtom).
 * - molette = zoom centré sur le curseur, clic-glissé = déplacement, double-clic = vue d'origine
 * - simple clic = ping visible par ceux qui regardent la même image
 * - le MJ peut forcer sa vue (zoom + position) chez tous les joueurs
 */

export const ZOOM_ID = "distribution-aides-fantasy";
const SOCKET = `module.${ZOOM_ID}`;

const MIN_SCALE = 0.2;
const MAX_SCALE = 8;
const WHEEL_SENSITIVITY = 0.0015;
const ZOOM_STEP = 1.25;
const PING_LIFETIME_MS = 2500;
const PING_MOVE_THRESHOLD = 6;
const PING_DBLCLICK_DELAY_MS = 250;

const ImagePopoutCls = () => foundry.applications?.apps?.ImagePopout ?? globalThis.ImagePopout;

/** Le zoom est actif si le réglage le permet et si l'ancien module n'est pas actif (sinon double barre). */
export function zoomEnabled() {
  if (game.modules.get("image-zoom-pan")?.active) return false;
  try { return game.settings.get(ZOOM_ID, "zoom"); } catch { return true; }
}

Hooks.once("init", () => {
  game.settings.register(ZOOM_ID, "zoom", {
    name: "Zoom et déplacement sur les images",
    hint: "Molette pour zoomer, clic-glissé pour déplacer, double-clic pour revenir, clic pour poser un ping. Le MJ peut forcer sa vue chez les joueurs. (Remplace le module « Zoom & Pan sur les images ».)",
    scope: "world", config: true, type: Boolean, default: true
  });
});

Hooks.once("ready", () => {
  if (game.user.isGM && game.modules.get("image-zoom-pan")?.active) {
    ui.notifications.info("Distribution d'aides de jeu (Fantasy) intègre maintenant le zoom des images : vous pouvez désactiver le module « Zoom & Pan sur les images ».", { permanent: false });
  }
});

Hooks.on("renderImagePopout", (app, html) => {
  if (!zoomEnabled()) return;
  const root = html instanceof HTMLElement ? html : html?.[0] ?? app.element;
  const img = root?.querySelector("img");
  if (!img) return;
  const src = img.getAttribute("src") ?? app.options?.src;
  const title = app.options?.window?.title ?? app.title ?? "";
  const distribute = game.user.isGM && src ? () => game.modules.get(ZOOM_ID)?.api?.openImage?.(src, title) : null;
  attachZoom(img.parentElement, img, { app, src, title, ping: true, broadcast: game.user.isGM, distribute });
});

/**
 * Branche le zoom sur une image.
 * opts : { app?, src, title, ping, broadcast, distribute? }
 */
export function attachZoom(wrapper, img, opts = {}) {
  if (!wrapper || !img || img.dataset.rfZoom === "1") return null;
  img.dataset.rfZoom = "1";

  const state = { scale: 1, x: 0, y: 0 };
  const ctl = { wrapper, img, state, src: opts.src, title: opts.title };
  if (opts.app) opts.app._rfZoom = ctl;

  wrapper.classList.add("rf-zoom-wrap");
  img.classList.add("rf-zoom-img");
  img.draggable = false;

  const clamp = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
  const apply = () => { img.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`; };
  const reset = () => { state.scale = 1; state.x = 0; state.y = 0; apply(); };
  ctl.apply = apply;
  ctl.set = (t) => { Object.assign(state, t); apply(); };

  wrapper.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    const r = wrapper.getBoundingClientRect();
    const ox = ev.clientX - r.left, oy = ev.clientY - r.top;
    const prev = state.scale;
    const next = clamp(prev * (1 - ev.deltaY * WHEEL_SENSITIVITY));
    state.x = ox - (ox - state.x) * (next / prev);
    state.y = oy - (oy - state.y) * (next / prev);
    state.scale = next;
    apply();
  }, { passive: false });

  let dragging = false, moved = false, lastX = 0, lastY = 0, downX = 0, downY = 0, pending = null;
  wrapper.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0 || ev.target.closest(".rf-zoom-bar")) return;
    dragging = true; moved = false;
    lastX = downX = ev.clientX; lastY = downY = ev.clientY;
    wrapper.classList.add("rf-zoom-drag");
    wrapper.setPointerCapture(ev.pointerId);
  });
  wrapper.addEventListener("pointermove", (ev) => {
    if (!dragging) return;
    state.x += ev.clientX - lastX; state.y += ev.clientY - lastY;
    lastX = ev.clientX; lastY = ev.clientY;
    if (!moved && Math.hypot(ev.clientX - downX, ev.clientY - downY) > PING_MOVE_THRESHOLD) moved = true;
    apply();
  });
  wrapper.addEventListener("pointerup", (ev) => {
    if (!dragging) return;
    dragging = false;
    wrapper.classList.remove("rf-zoom-drag");
    if (!moved && opts.ping) {
      clearTimeout(pending);
      pending = setTimeout(() => sendPing(ctl, ev.clientX, ev.clientY), PING_DBLCLICK_DELAY_MS);
    }
  });
  for (const t of ["pointercancel", "pointerleave"]) wrapper.addEventListener(t, () => { dragging = false; wrapper.classList.remove("rf-zoom-drag"); });
  wrapper.addEventListener("dblclick", () => { clearTimeout(pending); reset(); });

  // Barre d'outils
  const bar = document.createElement("div");
  bar.className = "rf-zoom-bar";
  const btn = (icon, tip, fn) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "rf-zoom-btn"; b.dataset.tooltip = tip; b.setAttribute("aria-label", tip);
    b.innerHTML = `<i class="${icon}"></i>`;
    b.addEventListener("click", (ev) => { ev.stopPropagation(); fn(); });
    bar.append(b);
  };
  btn("fa-solid fa-magnifying-glass-plus", "Zoomer", () => { state.scale = clamp(state.scale * ZOOM_STEP); apply(); });
  btn("fa-solid fa-magnifying-glass-minus", "Dézoomer", () => { state.scale = clamp(state.scale / ZOOM_STEP); apply(); });
  btn("fa-solid fa-arrows-rotate", "Vue d'origine", reset);
  if (opts.openFull) btn("fa-solid fa-up-right-and-down-left-from-center", "Ouvrir en grand", opts.openFull);
  if (opts.broadcast) btn("fa-solid fa-tower-broadcast", "Forcer cette vue chez les joueurs", () => broadcastView(ctl));
  if (opts.distribute) btn("fa-solid fa-envelope-open-text", "Remettre aux joueurs (missive)", opts.distribute);
  wrapper.append(bar);
  apply();
  return ctl;
}

/* ---------------- Vue forcée et pings ---------------- */

function openPopouts() {
  const Cls = ImagePopoutCls();
  const v2 = foundry.applications?.instances ? [...foundry.applications.instances.values()] : [];
  const v1 = Object.values(ui.windows ?? {});
  return [...v1, ...v2].filter((w) => Cls && w instanceof Cls && w._rfZoom);
}

function broadcastView(ctl) {
  if (!ctl.src) return ui.notifications.warn("Impossible de déterminer l'image à synchroniser.");
  game.socket.emit(SOCKET, { type: "zoomView", src: ctl.src, title: ctl.title ?? "", transform: { ...ctl.state } });
  ui.notifications.info(`Vue envoyée aux joueurs : ${ctl.title || ctl.src}`);
}

function sendPing(ctl, clientX, clientY) {
  if (!ctl.src) return;
  const r = ctl.img.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const fracX = (clientX - r.left) / r.width, fracY = (clientY - r.top) / r.height;
  const color = game.user.color?.css ?? game.user.color ?? "#ff6400";
  placePing(ctl, fracX, fracY, color, game.user.name);
  game.socket.emit(SOCKET, { type: "zoomPing", src: ctl.src, fracX, fracY, color, name: game.user.name });
}

function placePing(ctl, fracX, fracY, color, name) {
  const w = ctl.wrapper.getBoundingClientRect(), r = ctl.img.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const m = document.createElement("div");
  m.className = "rf-ping";
  m.style.left = `${r.left - w.left + fracX * r.width}px`;
  m.style.top = `${r.top - w.top + fracY * r.height}px`;
  m.style.setProperty("--ping-color", color);
  m.innerHTML = `<div class="rf-ping-ring"></div><div class="rf-ping-ring rf-ping-late"></div><div class="rf-ping-dot"></div><div class="rf-ping-label">${foundry.utils.escapeHTML(name ?? "")}</div>`;
  ctl.wrapper.append(m);
  setTimeout(() => m.remove(), PING_LIFETIME_MS);
}

/** Appelé par le gestionnaire de socket du module. Renvoie true si le message était pour le zoom. */
export function handleZoomSocket(data) {
  if (data?.type !== "zoomPing" && data?.type !== "zoomView") return false;
  if (!zoomEnabled() || !data.src) return true;
  const matches = openPopouts().filter((w) => w._rfZoom.src === data.src);
  if (data.type === "zoomPing") {
    for (const w of matches) placePing(w._rfZoom, data.fracX, data.fracY, data.color, data.name);
    return true;
  }
  if (matches.length) {
    matches[0]._rfZoom.set(data.transform);
    matches[0].bringToFront?.() ?? matches[0].bringToTop?.();
    return true;
  }
  const Cls = ImagePopoutCls();
  const pop = new Cls({ src: data.src, window: { title: data.title } });
  const hook = Hooks.on("renderImagePopout", (app) => {
    if (app !== pop) return;
    Hooks.off("renderImagePopout", hook);
    requestAnimationFrame(() => app._rfZoom?.set(data.transform));
  });
  pop.render(true);
  return true;
}

/** Ouvre une image dans la fenêtre d'aperçu de Foundry (avec zoom). */
export function openImage(src, title) {
  const Cls = ImagePopoutCls();
  if (Cls && src) new Cls({ src, window: { title: title ?? "" } }).render(true);
}
