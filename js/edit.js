// js/edit.js
import { supabase } from "./supabaseClient.js";
import { SHARED_EDITOR_EMAIL, IMAGE_BUCKET } from "./config.js";
import { ymdToMinutes, minutesToYMD } from "./dates.js";

let onMode = () => {};

function setMode(on) {
  document.body.classList.toggle("edit-mode", on);
  const lbl = document.querySelector("#lock-btn .lock-label");
  if (lbl) lbl.textContent = on ? "Salir" : "Editar";
  onMode(on);
}

function buildLoginModal() {
  const m = document.createElement("div");
  m.className = "login-modal";
  m.innerHTML = `<div class="login-card">
    <strong>Editar la cronología</strong>
    <input id="login-pass" type="password" placeholder="Contraseña de campaña" autocomplete="current-password"/>
    <div class="err" id="login-err"></div>
    <button id="login-go" class="btn-primary">Entrar</button></div>`;
  document.body.appendChild(m);
  m.addEventListener("click", e => { if (e.target === m) m.classList.remove("open"); });
  async function tryLogin() {
    const pass = m.querySelector("#login-pass").value;
    const { error } = await supabase.auth.signInWithPassword({ email: SHARED_EDITOR_EMAIL, password: pass });
    if (error) {
      const wrong = error.status === 400 || /invalid|credential/i.test(error.message || "");
      m.querySelector("#login-err").textContent =
        wrong ? "Contraseña incorrecta" : "Error de conexión, inténtalo de nuevo";
      return;
    }
    m.querySelector("#login-pass").value = "";
    m.classList.remove("open");
    setMode(true);
  }
  m.querySelector("#login-go").addEventListener("click", tryLogin);
  m.querySelector("#login-pass").addEventListener("keydown", e => { if (e.key === "Enter") tryLogin(); });
  return m;
}

// ---- CRUD half ----

function buildEventForm() {
  const m = document.createElement("div");
  m.className = "event-form-modal";
  m.innerHTML = `<div class="event-form">
    <div class="ef-head">
      <strong id="ef-title">Nuevo evento</strong>
      <button id="ef-close" class="ef-x" aria-label="Cerrar" title="Cerrar">&times;</button>
    </div>

    <div class="ef-field">
      <label class="ef-lbl" for="ef-name">Nombre</label>
      <input id="ef-name" type="text" placeholder="Ej. Nace Cyro"/>
    </div>

    <div class="ef-field">
      <label class="ef-lbl" for="ef-date">Fecha</label>
      <div class="ef-daterow">
        <input id="ef-date" type="date"/>
        <div class="ef-era" role="radiogroup" aria-label="Era">
          <label><input type="radio" name="ef-era" value="ce" checked/><span>d.C.</span></label>
          <label><input type="radio" name="ef-era" value="bce"/><span>a.C.</span></label>
        </div>
      </div>
      <p class="ef-hint">Elige «a.C.» solo para fechas antes de Cristo (eventos muy antiguos).</p>
    </div>

    <div class="ef-field-row">
      <div class="ef-field ef-color-field">
        <label class="ef-lbl" for="ef-color">Color</label>
        <input id="ef-color" type="color" value="#0079CC"/>
      </div>
      <div class="ef-field ef-img-field">
        <label class="ef-lbl">Imagen <span class="ef-opt">(opcional)</span></label>
        <label class="ef-file" for="ef-img"><span id="ef-file-name">Elegir imagen…</span></label>
        <input id="ef-img" type="file" accept="image/*" hidden/>
      </div>
    </div>

    <div class="ef-preview" id="ef-preview" hidden><img id="ef-preview-img" alt="Vista previa"/></div>

    <div class="err" id="ef-err"></div>

    <div class="ef-actions">
      <button id="ef-cancel" class="btn-secondary">Cancelar</button>
      <button id="ef-save" class="btn-primary">Guardar</button>
    </div>
  </div>`;
  document.body.appendChild(m);

  const close = () => m.classList.remove("open");
  m.addEventListener("click", e => { if (e.target === m) close(); });
  m.querySelector("#ef-close").addEventListener("click", close);
  m.querySelector("#ef-cancel").addEventListener("click", close);

  // file picker → filename label + live preview
  const fileName = m.querySelector("#ef-file-name");
  const preview = m.querySelector("#ef-preview");
  const previewImg = m.querySelector("#ef-preview-img");
  m.querySelector("#ef-img").addEventListener("change", (ev) => {
    const f = ev.target.files[0];
    fileName.textContent = f ? f.name : "Elegir imagen…";
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    if (f) { previewUrl = URL.createObjectURL(f); previewImg.src = previewUrl; preview.hidden = false; }
    else { preview.hidden = true; previewImg.removeAttribute("src"); }
  });
  return m;
}

let formEl, editingId = null, editingOldImage = null, previewUrl = null;
let uploadImage = async () => null;    // replaced in Task 9 via setUploader

function startMinutesFromForm(m) {
  const v = m.querySelector("#ef-date").value;            // "YYYY-MM-DD"
  const [y, mo, d] = v.split("-").map(Number);
  const bce = m.querySelector('input[name="ef-era"]:checked')?.value === "bce";
  const year = bce ? 1 - y : y;                            // BCE → astronomical
  return ymdToMinutes(year, mo, d);
}

function wireCrud(supabaseClient) {
  formEl = buildEventForm();
  const fileName = formEl.querySelector("#ef-file-name");
  const preview = formEl.querySelector("#ef-preview");
  const previewImg = formEl.querySelector("#ef-preview-img");

  window.__openEventForm = (ev) => {
    editingId = ev?.id ?? null;
    editingOldImage = ev?.image_path ?? null;
    formEl.querySelector("#ef-title").textContent = ev ? "Editar evento" : "Nuevo evento";
    formEl.querySelector("#ef-name").value = ev?.name ?? "";
    formEl.querySelector("#ef-color").value = ev?.color ?? "#0079CC";
    formEl.querySelector("#ef-err").textContent = "";
    formEl.querySelector("#ef-img").value = "";
    fileName.textContent = "Elegir imagen…";
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }

    let bce = false;
    if (ev) {
      const { year, month, day } = minutesToYMD(ev.start_minutes);
      bce = year <= 0;
      const yy = String(bce ? 1 - year : year).padStart(4, "0");
      formEl.querySelector("#ef-date").value =
        `${yy}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    } else {
      formEl.querySelector("#ef-date").value = "";
    }
    formEl.querySelector(`input[name="ef-era"][value="${bce ? "bce" : "ce"}"]`).checked = true;

    // show existing image (when editing) as preview
    if (ev?.imageUrl) { previewImg.src = ev.imageUrl; preview.hidden = false; }
    else { preview.hidden = true; previewImg.removeAttribute("src"); }

    formEl.classList.add("open");
  };

  window.__deleteEvent = async (ev) => {
    if (!confirm(`¿Borrar "${ev.name}"?`)) return;
    await supabaseClient.from("events").delete().eq("id", ev.id);
    if (ev.image_path) {
      // best-effort: remove the now-orphaned image from Storage
      await supabaseClient.storage.from(IMAGE_BUCKET).remove([ev.image_path]).catch(() => {});
    }
    window.__reload();
  };

  formEl.querySelector("#ef-save").addEventListener("click", async () => {
    try {
      const name = formEl.querySelector("#ef-name").value.trim();
      if (!name) { formEl.querySelector("#ef-err").textContent = "El nombre es obligatorio."; return; }
      const dateVal = formEl.querySelector("#ef-date").value;
      if (!dateVal) { formEl.querySelector("#ef-err").textContent = "La fecha es obligatoria."; return; }
      const start_minutes = startMinutesFromForm(formEl);
      const color = formEl.querySelector("#ef-color").value;
      const file = formEl.querySelector("#ef-img").files[0];
      const has_image_field = !!file;
      let image_path;
      if (file) image_path = await uploadImage(file);
      const payload = { name, start_minutes, color };
      if (has_image_field) payload.image_path = image_path;
      if (editingId) {
        await supabaseClient.from("events").update(payload).eq("id", editingId);
        if (has_image_field && image_path && editingOldImage && editingOldImage !== image_path) {
          await supabaseClient.storage.from(IMAGE_BUCKET).remove([editingOldImage]).catch(() => {});
        }
      } else {
        await supabaseClient.from("events").insert(payload);
      }
      if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
      formEl.classList.remove("open");
      window.__reload();
    } catch (e) {
      formEl.querySelector("#ef-err").textContent = String(e.message || e);
    }
  });
}

/** Task 9 calls this to inject the real image uploader. */
export function setUploader(fn) { uploadImage = fn; }

export async function initEditing({ onModeChange } = {}) {
  onMode = onModeChange || (() => {});

  // Wire CRUD before setting up session (so __openEventForm/__deleteEvent exist early)
  wireCrud(supabase);

  const modal = buildLoginModal();
  document.getElementById("lock-btn").addEventListener("click", async () => {
    if (document.body.classList.contains("edit-mode")) { await supabase.auth.signOut(); setMode(false); }
    else modal.classList.add("open");
  });
  window.addEventListener("hashchange", () => { if (location.hash === "#editar") modal.classList.add("open"); });
  if (location.hash === "#editar") modal.classList.add("open");
  const { data } = await supabase.auth.getSession();
  if (data.session) setMode(true);   // restore prior session on this device
}
