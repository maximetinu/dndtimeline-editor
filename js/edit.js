// js/edit.js
import { supabase } from "./supabaseClient.js";
import { SHARED_EDITOR_EMAIL } from "./config.js";
import { ymdToMinutes, minutesToYMD } from "./dates.js";

let onMode = () => {};

function setMode(on) { document.body.classList.toggle("edit-mode", on); onMode(on); }

function buildLoginModal() {
  const m = document.createElement("div");
  m.className = "login-modal";
  m.innerHTML = `<div class="login-card">
    <strong>Editar la cronología</strong>
    <input id="login-pass" type="password" placeholder="Contraseña de campaña" autocomplete="current-password"/>
    <div class="err" id="login-err"></div>
    <button id="login-go">Entrar</button></div>`;
  document.body.appendChild(m);
  m.addEventListener("click", e => { if (e.target === m) m.classList.remove("open"); });
  m.querySelector("#login-go").addEventListener("click", async () => {
    const pass = m.querySelector("#login-pass").value;
    const { error } = await supabase.auth.signInWithPassword({ email: SHARED_EDITOR_EMAIL, password: pass });
    if (error) { m.querySelector("#login-err").textContent = "Contraseña incorrecta"; return; }
    m.classList.remove("open"); setMode(true);
  });
  return m;
}

// ---- CRUD half ----

function buildEventForm() {
  const m = document.createElement("div");
  m.className = "event-form-modal";
  m.innerHTML = `<div class="event-form">
    <strong id="ef-title">Nuevo evento</strong>
    <input id="ef-name" type="text" placeholder="Nombre del evento"/>
    <label>Fecha <input id="ef-date" type="date"/></label>
    <label><input id="ef-bce" type="checkbox"/> Antes de Cristo (BCE)</label>
    <div class="row2"><input id="ef-color" type="color" value="#0079CC"/>
      <input id="ef-img" type="file" accept="image/*"/></div>
    <div class="err" id="ef-err"></div>
    <div class="row2"><button id="ef-save">Guardar</button><button id="ef-cancel">Cancelar</button></div>
  </div>`;
  document.body.appendChild(m);
  m.addEventListener("click", e => { if (e.target === m) m.classList.remove("open"); });
  m.querySelector("#ef-cancel").addEventListener("click", () => m.classList.remove("open"));
  return m;
}

let formEl, editingId = null;
let uploadImage = async () => null;    // replaced in Task 9 via setUploader

function startMinutesFromForm(m) {
  const v = m.querySelector("#ef-date").value;            // "YYYY-MM-DD"
  const [y, mo, d] = v.split("-").map(Number);
  const year = m.querySelector("#ef-bce").checked ? 1 - y : y; // BCE → astronomical
  return ymdToMinutes(year, mo, d);
}

function wireCrud(supabaseClient) {
  formEl = buildEventForm();

  window.__openEventForm = (ev) => {
    editingId = ev?.id ?? null;
    formEl.querySelector("#ef-title").textContent = ev ? "Editar evento" : "Nuevo evento";
    formEl.querySelector("#ef-name").value = ev?.name ?? "";
    formEl.querySelector("#ef-color").value = ev?.color ?? "#0079CC";
    formEl.querySelector("#ef-err").textContent = "";
    formEl.querySelector("#ef-img").value = "";
    if (ev) {
      const { year, month, day } = minutesToYMD(ev.start_minutes);
      const bce = year <= 0;
      formEl.querySelector("#ef-bce").checked = bce;
      const yy = String(bce ? 1 - year : year).padStart(4, "0");
      formEl.querySelector("#ef-date").value =
        `${yy}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    } else {
      formEl.querySelector("#ef-date").value = "";
      formEl.querySelector("#ef-bce").checked = false;
    }
    formEl.classList.add("open");
  };

  window.__deleteEvent = async (ev) => {
    if (!confirm(`¿Borrar "${ev.name}"?`)) return;
    await supabaseClient.from("events").delete().eq("id", ev.id);
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
      if (file) image_path = await uploadImage(file);   // seam for Task 9
      const payload = { name, start_minutes, color };
      if (has_image_field) payload.image_path = image_path;
      if (editingId) {
        await supabaseClient.from("events").update(payload).eq("id", editingId);
      } else {
        await supabaseClient.from("events").insert(payload);
      }
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
  document.getElementById("lock-btn").addEventListener("click", () => {
    if (document.body.classList.contains("edit-mode")) { supabase.auth.signOut(); setMode(false); }
    else modal.classList.add("open");
  });
  window.addEventListener("hashchange", () => { if (location.hash === "#editar") modal.classList.add("open"); });
  if (location.hash === "#editar") modal.classList.add("open");
  const { data } = await supabase.auth.getSession();
  if (data.session) setMode(true);   // restore prior session on this device
}
