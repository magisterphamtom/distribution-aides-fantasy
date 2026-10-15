/**
 * Distribution d'aides de jeu — Fantasy (D&D 5e)
 * Le MJ remet un document (image ou page de journal) à un ou plusieurs joueurs :
 * il apparaît chez eux avec une animation, et se range tout seul dans leur journal d'aventure.
 * Foundry VTT v13 / v14 — magisterphamtom — MIT
 */

import { attachZoom, handleZoomSocket, openImage, zoomEnabled } from "./zoom.js";

const ID = "distribution-aides-fantasy";
const SOCKET = `module.${ID}`;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const active = (id) => !!game.modules.get(id)?.active;
const TextEditorImpl = () => foundry.applications.ux.TextEditor.implementation;

/* ================================================================== */
/*  Réglages                                                           */
/* ================================================================== */

Hooks.once("init", () => {
  game.settings.register(ID, "logbookFolder", {
    name: "Dossier des journaux d'aventure",
    hint: "Dossier qui contient un journal par joueur (le joueur en est propriétaire). Laissez vide : le module cherche un dossier dont le nom commence par « Journal d'aventure » (ou « Journal de bord »).",
    scope: "world", config: true, type: String, default: ""
  });
  game.settings.register(ID, "createLogbook", {
    name: "Créer le journal d'aventure s'il n'existe pas",
    hint: "Si un joueur n'a pas encore de journal d'aventure, le module en crée un (à son nom de personnage) dans le dossier des journaux d'aventure.",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(ID, "chatLog", {
    name: "Trace dans le chat",
    hint: "Un message privé (MJ + destinataires) garde la trace de chaque remise.",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(ID, "sound", {
    name: "Son à la réception",
    hint: "Chemin d'un son joué chez le destinataire (vide : aucun).",
    scope: "world", config: true, type: String, default: "sounds/notify.wav", filePicker: "audio"
  });
});

Hooks.once("ready", () => {
  game.socket.on(SOCKET, (data) => {
    try {
      if (handleZoomSocket(data)) return;
      if (data?.type === "handout" && data.users?.includes(game.user.id)) Reveal.show(data);
    } catch (err) {
      console.error(`${ID} | réception`, err);
    }
  });
  const mod = game.modules.get(ID);
  if (mod) mod.api = { open: (doc) => DistributeApp.open(doc), distribute };
});


/* ================================================================== */
/*  Journaux de bord                                                   */
/* ================================================================== */

function logbookFolder() {
  const wanted = game.settings.get(ID, "logbookFolder").trim().toLowerCase();
  const folders = game.folders.filter((f) => f.type === "JournalEntry");
  if (wanted) return folders.find((f) => f.name.trim().toLowerCase() === wanted) ?? null;
  return folders.find((f) => /^journa(l|ux) (d'aventure|de bord)/i.test(f.name.trim())) ?? null;
}

function logbookFor(user) {
  const folder = logbookFolder();
  const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  const candidates = game.journal.filter((j) =>
    (folder ? j.folder?.id === folder.id : /journal (d'aventure|de bord)/i.test(j.name)) && j.ownership?.[user.id] === OWNER);
  if (candidates.length <= 1) return candidates[0] ?? null;
  const charName = user.character?.name?.toLowerCase();
  return candidates.find((j) => charName && j.name.toLowerCase().includes(charName.split(" ")[0])) ?? candidates[0];
}

async function ensureLogbook(user) {
  const existing = logbookFor(user);
  if (existing || !game.settings.get(ID, "createLogbook")) return existing;
  const folder = logbookFolder();
  const name = `Journal d'aventure [${user.character?.name ?? user.name}]`;
  return JournalEntry.create({
    name,
    folder: folder?.id ?? null,
    ownership: { default: 0, [user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER }
  });
}

/* ================================================================== */
/*  Distribution                                                       */
/* ================================================================== */

/**
 * handout = { kind: "image" | "page" | "entry", title, src?, uuid? }
 * options = { users: [ids], file: bool, reveal: bool, grant: bool, note: string }
 */
async function distribute(handout, options) {
  if (!game.user.isGM) return;
  const users = options.users.map((id) => game.users.get(id)).filter(Boolean);
  if (!users.length) return ui.notifications.warn("Choisissez au moins un destinataire.");

  // Pages à recopier
  let pages = [];
  let source = null;
  if (handout.kind === "image") {
    pages = [{ type: "image", name: handout.title, src: handout.src, image: { caption: options.note || "" } }];
  } else {
    source = await fromUuid(handout.uuid);
    if (!source) return ui.notifications.error("Document introuvable.");
    const list = handout.kind === "entry" ? [...source.pages] : [source];
    pages = list.map((p) => {
      const data = p.toObject();
      delete data._id;
      delete data.ownership;
      if (handout.kind === "page") data.name = handout.title || data.name;
      data.sort = undefined;
      return data;
    });
  }

  const delivered = {};
  const failed = [];
  for (const user of users) {
    let pageUuid = null;
    try {
      // 1. Rangement dans le journal d'aventure
      if (options.file) {
        const book = await ensureLogbook(user);
        if (book) {
          const stamp = new Date().toLocaleDateString("fr-FR");
          const created = await book.createEmbeddedDocuments("JournalEntryPage", pages.map((p) => ({
            ...p,
            flags: { ...(p.flags ?? {}), [ID]: { received: stamp, note: options.note || "" } }
          })));
          pageUuid = created[0]?.uuid ?? null;
        } else failed.push(`${user.name} (pas de journal d'aventure)`);
      }
      // 2. Accès en lecture au document d'origine
      if (options.grant && source) {
        const doc = handout.kind === "page" ? source.parent : source;
        const lvl = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
        if ((doc.ownership?.[user.id] ?? 0) < lvl) await doc.update({ [`ownership.${user.id}`]: lvl });
      }
      delivered[user.id] = pageUuid;
    } catch (err) {
      console.error(`${ID} | remise à ${user.name}`, err);
      failed.push(user.name);
    }
  }

  // 3. Apparition chez les destinataires
  if (options.reveal) {
    const payload = {
      type: "handout",
      users: Object.keys(delivered),
      pages: delivered,
      title: handout.title,
      note: options.note || "",
      sender: options.sender || "",
      imgName: handout.preview || handout.src || null,
      kind: handout.kind,
      src: handout.kind === "image" ? handout.src : null,
      sourceUuid: handout.uuid ?? null
    };
    game.socket.emit(SOCKET, payload);
    if (options.preview) Reveal.show({ ...payload, users: [game.user.id], preview: true });
  }

  // 4. Trace dans le chat
  if (game.settings.get(ID, "chatLog")) {
    const names = users.filter((u) => u.id in delivered).map((u) => esc(u.character?.name ?? u.name)).join(", ");
    if (names) {
      await ChatMessage.create({
        content: `<div class="rf-chat"><i class="fa-solid fa-envelope-open-text"></i> <b>${esc(handout.title)}</b> remis à ${names}${options.note ? `<br><em>${esc(options.note)}</em>` : ""}${options.file ? `<br><span class="rf-chat-sub">Rangé dans le journal d'aventure.</span>` : ""}</div>`,
        whisper: [...new Set([...game.users.filter((u) => u.isGM).map((u) => u.id), ...Object.keys(delivered)])]
      });
    }
  }

  const ok = Object.keys(delivered).length;
  if (failed.length) ui.notifications.warn(`Remis à ${ok} joueur(s). Problème : ${failed.join(", ")}.`);
  else ui.notifications.info(`« ${handout.title} » remis à ${ok} joueur(s).`);
}

/* ================================================================== */
/*  Apparition chez le joueur                                          */
/* ================================================================== */

const Reveal = {
  async show(data) {
    document.getElementById("rf-reveal")?.remove();
    const pageUuid = data.pages?.[game.user.id] ?? null;

    // Contenu à montrer
    let body = "";
    let imgSrc = null;
    const imgHtml = (src) => { imgSrc = src; return `<div class="rf-doc-imgwrap"><img class="rf-doc-img" src="${esc(src)}" alt=""></div>`; };
    if (data.kind === "image") {
      body = imgHtml(data.src);
    } else {
      const page = (pageUuid ? await fromUuid(pageUuid) : null) ?? (data.sourceUuid ? await fromUuid(data.sourceUuid) : null);
      const first = page?.documentName === "JournalEntry" ? page.pages.contents[0] : page;
      if (first?.type === "image") body = imgHtml(first.src);
      else if (first?.text?.content) {
        const html = await TextEditorImpl().enrichHTML(first.text.content, { relativeTo: first, secrets: false });
        body = `<div class="rf-doc-text">${html}</div>`;
      } else body = `<p class="rf-doc-empty">Le document a été rangé dans votre journal d'aventure.</p>`;
    }

    const el = document.createElement("div");
    el.id = "rf-reveal";
    el.className = "rf-reveal rf-fantasy";
    const foot = `<footer class="rf-doc-foot">
            ${pageUuid ? `<button type="button" data-rf="open"><i class="fa-solid fa-book-open"></i> Ouvrir dans mon journal d'aventure</button>` : ""}
            <button type="button" data-rf="close"><i class="fa-solid fa-check"></i> ${pageUuid ? "Ranger" : "Fermer"}</button>
          </footer>`;
    const sender = parseSender(data.sender);
    const motes = Array.from({ length: 14 }, (_, i) =>
      `<i style="left:${(i * 7.3 + 3) % 100}%;animation-delay:${(i * 0.37) % 5}s;animation-duration:${4 + (i % 4)}s"></i>`).join("");
    el.innerHTML = `
      <div class="rf-veil"></div>
      <div class="rf-motes">${motes}</div>
      <div class="rf-stage">
        <div class="rf-glow"></div>
        <div class="rf-roll">
          <div class="rf-roll-body"></div>
          <div class="rf-ribbon"></div>
          <div class="rf-seal">
            <div class="rf-seal-half rf-seal-l"><i class="fa-solid fa-dragon"></i></div>
            <div class="rf-seal-half rf-seal-r"><i class="fa-solid fa-dragon"></i></div>
          </div>
        </div>
        <div class="rf-doc">
          <div class="rf-rod rf-rod-top"></div>
          <div class="rf-sheet">
            <header class="rf-doc-head">
              <span class="rf-doc-kicker">${data.sender ? `De la part de ${esc(sender.name)}` : "Missive remise"}</span>
              <span class="rf-doc-title">${esc(data.title)}</span>
              <div class="rf-orn"><i class="fa-solid fa-dragon"></i></div>
              ${data.note ? `<span class="rf-doc-note">${esc(data.note)}</span>` : ""}
            </header>
            <div class="rf-doc-body">${body}</div>
            ${foot}
          </div>
          <div class="rf-rod rf-rod-bot"></div>
        </div>
      </div>`;
    el.addEventListener("click", async (ev) => {
      const b = ev.target.closest("[data-rf]");
      if (ev.target.classList.contains("rf-veil") || b?.dataset.rf === "close") return this.close(el);
      if (b?.dataset.rf === "open" && pageUuid) {
        this.close(el);
        const page = await fromUuid(pageUuid);
        page?.parent?.sheet?.render(true, { pageId: page.id });
      }
    });
    document.body.append(el);
    if (imgSrc && zoomEnabled()) {
      const wrap = el.querySelector(".rf-doc-imgwrap");
      attachZoom(wrap, wrap.querySelector("img"), {
        src: imgSrc, title: data.title, ping: false, broadcast: false,
        openFull: () => { this.close(el); openImage(imgSrc, data.title); }
      });
    }
    requestAnimationFrame(() => el.classList.add("rf-play"));

    const sound = game.settings.get(ID, "sound");
    if (sound) foundry.audio.AudioHelper.play({ src: sound, volume: 0.6, autoplay: true, loop: false }, false);
  },

  close(el) {
    el.classList.add("rf-leaving");
    setTimeout(() => el.remove(), 350);
  }
};

/* ================================================================== */
/*  Fenêtre du MJ                                                 */
/* ================================================================== */

/** « Nom <adresse> », « adresse » ou « Nom » → { name, addr, initial } */
function parseSender(raw) {
  const t = String(raw ?? "").trim();
  let name = t, addr = "";
  const m = t.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (m) { name = m[1].trim() || m[2].trim(); addr = m[2].trim(); }
  else if (/^\S+@\S+$/.test(t)) { addr = t; name = t.split("@")[0]; }
  if (!name) name = "Expéditeur inconnu";
  return { name, addr, initial: (name.match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase() };
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class DistributeApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static instance = null;

  static DEFAULT_OPTIONS = {
    id: "distribution-aides-fantasy-app",
    tag: "form",
    classes: ["rf-app"],
    window: { title: "Remettre une aide de jeu", icon: "fa-solid fa-envelope-open-text", resizable: true },
    position: { width: 480, height: "auto" },
    form: { handler: DistributeApp.#onSubmit, closeOnSubmit: false },
    actions: {
      pickImage: DistributeApp.#pickImage,
      clearDoc: DistributeApp.#clearDoc,
      all: DistributeApp.#all,
      none: DistributeApp.#none
    }
  };

  static PARTS = { main: { template: `modules/${ID}/templates/distribute.hbs` } };

  handout = null;

  static async open(doc) {
    if (!game.user.isGM) return;
    if (!this.instance) this.instance = new DistributeApp();
    if (doc) await this.instance.setDocument(doc);
    this.instance.render({ force: true });
  }

  async setDocument(doc) {
    if (typeof doc === "string") doc = await fromUuid(doc);
    if (!doc) return;
    if (doc.documentName === "JournalEntryPage") {
      this.handout = { kind: "page", uuid: doc.uuid, title: doc.name, preview: doc.type === "image" ? doc.src : null, type: doc.type, parentName: doc.parent?.name };
    } else if (doc.documentName === "JournalEntry") {
      const first = doc.pages.contents[0];
      this.handout = { kind: "entry", uuid: doc.uuid, title: doc.name, preview: first?.type === "image" ? first.src : null, type: "entry", count: doc.pages.size };
    } else if (doc.documentName === "Tile" || doc.documentName === "Actor" || doc.documentName === "Item") {
      const src = doc.texture?.src ?? doc.img;
      this.handout = { kind: "image", src, title: doc.name ?? "Image", preview: src, type: "image" };
    }
  }

  async _prepareContext() {
    const players = game.users.filter((u) => !u.isGM).map((u) => ({
      id: u.id,
      name: u.name,
      character: u.character?.name ?? "",
      active: u.active,
      book: !!logbookFor(u),
      color: u.color?.css ?? u.color
    })).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "fr"));
    return {
      h: this.handout,
      players,
      folder: logbookFolder()?.name ?? null,
      canCreate: game.settings.get(ID, "createLogbook")
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const zone = this.element.querySelector(".rf-drop");
    if (!zone) return;
    zone.addEventListener("dragover", (ev) => { ev.preventDefault(); zone.classList.add("rf-over"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("rf-over"));
    zone.addEventListener("drop", async (ev) => {
      ev.preventDefault();
      zone.classList.remove("rf-over");
      try {
        const data = TextEditorImpl().getDragEventData(ev);
        if (data?.uuid) await this.setDocument(data.uuid);
        else if (data?.type === "Tile" && data.texture?.src) this.handout = { kind: "image", src: data.texture.src, title: "Image", preview: data.texture.src, type: "image" };
        this.render();
      } catch (err) {
        console.error(`${ID} | dépôt`, err);
        ui.notifications.error("Ce document ne peut pas être remis.");
      }
    });
  }

  static #pickImage() {
    const FP = foundry.applications.apps.FilePicker.implementation;
    new FP({
      type: "image",
      callback: (path) => {
        const name = decodeURIComponent(path.split("/").pop().replace(/\.[^.]+$/, "")).replace(/[_-]+/g, " ");
        this.handout = { kind: "image", src: path, title: name, preview: path, type: "image" };
        this.render();
      }
    }).render(true);
  }

  static #clearDoc() { this.handout = null; this.render(); }
  static #all() { this.element.querySelectorAll('input[name="users"]').forEach((c) => { c.checked = true; }); }
  static #none() { this.element.querySelectorAll('input[name="users"]').forEach((c) => { c.checked = false; }); }

  static async #onSubmit(event, form, formData) {
    if (!this.handout) return ui.notifications.warn("Déposez d'abord un document ou choisissez une image.");
    const fd = form.elements;
    const users = [...form.querySelectorAll('input[name="users"]:checked')].map((c) => c.value);
    const handout = { ...this.handout, title: fd.title.value.trim() || this.handout.title };
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      await distribute(handout, {
        users,
        note: fd.note.value.trim(),
        sender: fd.sender?.value.trim() ?? "",
        file: fd.file.checked,
        reveal: fd.reveal.checked,
        grant: fd.grant?.checked ?? false,
        preview: fd.preview.checked
      });
    } finally {
      if (btn) btn.disabled = false;
    }
  }
}

/* ================================================================== */
/*  Points d'entrée : barre de gauche, clic droit, en-tête de journal  */
/* ================================================================== */

Hooks.on("getSceneControlButtons", (controls) => {
  const tokens = controls.tokens;
  if (!tokens?.tools) return;
  tokens.tools.distributionAides = {
    name: "distributionAides",
    title: "Remettre une aide de jeu",
    icon: "fa-solid fa-envelope-open-text",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: game.user.isGM,
    onChange: () => DistributeApp.open()
  };
});

const isV14 = () => (game.release?.generation ?? 13) >= 14;
function pickTarget(args) {
  for (const a of args) {
    if (a instanceof HTMLElement) return a;
    if (a?.[0] instanceof HTMLElement) return a[0];
  }
  return args.find((a) => a?.currentTarget instanceof HTMLElement)?.currentTarget ?? null;
}
function entryFrom(target) {
  const li = target?.closest?.("[data-entry-id], [data-document-id]") ?? target;
  const id = li?.dataset?.entryId ?? li?.dataset?.documentId;
  return id ? game.journal.get(id) : null;
}

Hooks.on("getJournalEntryContextOptions", (app, items) => {
  if (!game.user.isGM) return;
  const run = (...args) => { const e = entryFrom(pickTarget(args)); if (e) DistributeApp.open(e); };
  const label = "Remettre aux joueurs…";
  items.push(isV14()
    ? { label, icon: "fa-solid fa-envelope-open-text", onClick: run }
    : { name: label, icon: '<i class="fa-solid fa-envelope-open-text"></i>', callback: run });
});

// Bouton dans le menu de la fenêtre d'un journal : remet la page affichée
Hooks.on("getHeaderControlsJournalEntrySheet", (app, controls) => {
  if (!game.user.isGM) return;
  app.options.actions ??= {};
  app.options.actions.rfDistribute = function () {
    const pageId = this.pageId ?? this._pages?.[this.pageIndex]?._id;
    const page = pageId ? this.document.pages.get(pageId) : null;
    DistributeApp.open(page ?? this.document);
  };
  controls.push({ icon: "fa-solid fa-envelope-open-text", label: "Remettre aux joueurs…", action: "rfDistribute" });
});
