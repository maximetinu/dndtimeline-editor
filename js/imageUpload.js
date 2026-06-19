// js/imageUpload.js
import { supabase } from "./supabaseClient.js";
import { IMAGE_BUCKET } from "./config.js";

function resize(file, max = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? resolve(b) : reject(new Error("toBlob failed")), "image/webp", quality);
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

export async function uploadResizedImage(file) {
  const blob = await resize(file);
  const path = `${crypto.randomUUID()}.webp`;
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, blob, {
    contentType: "image/webp", upsert: false,
  });
  if (error) throw error;
  return path;
}
