// js/main.js
import { supabase } from "./supabaseClient.js";
import { SUPABASE_URL, IMAGE_BUCKET } from "./config.js";
import { renderTimeline } from "./render.js";

function imageUrl(path) {
  return path ? `${SUPABASE_URL}/storage/v1/object/public/${IMAGE_BUCKET}/${path}` : null;
}

export async function fetchEvents() {
  const { data, error } = await supabase
    .from("events").select("*").order("start_minutes", { ascending: true });
  if (error) { console.error(error); return []; }
  return data.map(r => ({ ...r, imageUrl: imageUrl(r.image_path) }));
}

const container = document.getElementById("chronicle");
renderTimeline(container, await fetchEvents());
window.__reload = async () => renderTimeline(container, await fetchEvents());
