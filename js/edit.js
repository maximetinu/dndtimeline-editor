// js/edit.js
import { supabase } from "./supabaseClient.js";
import { SHARED_EDITOR_EMAIL } from "./config.js";

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

export async function initEditing({ onModeChange } = {}) {
  onMode = onModeChange || (() => {});
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
