// js/lightbox.js
export function el(tag, cls, html) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

export const CALENDAR_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/>' +
  '<path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h4"/><path d="M8 18h.01"/><path d="M12 18h4"/></svg>';

// build lightbox element once
const lightbox = el("div", "lightbox");
lightbox.setAttribute("role", "dialog");
lightbox.setAttribute("aria-modal", "true");
lightbox.innerHTML =
  '<button class="lb-close" aria-label="Cerrar">&times;</button>' +
  '<figure class="lb-figure">' +
  '<div class="lb-icon" aria-hidden="true">' + CALENDAR_ICON + "</div>" +
  '<img class="lb-img" alt="" />' +
  '<figcaption class="lb-cap"><span class="lb-name"></span><span class="lb-date"></span></figcaption>' +
  "</figure>";
document.body.appendChild(lightbox);

const lbIcon = lightbox.querySelector(".lb-icon");
const lbImg = lightbox.querySelector(".lb-img");
const lbName = lightbox.querySelector(".lb-name");
const lbDate = lightbox.querySelector(".lb-date");

export function openDetail(ev) {
  if (ev.imageUrl) {
    lbImg.src = ev.imageUrl;
    lbImg.alt = ev.name || "";
    lbImg.style.display = "";
    lbIcon.style.display = "none";
  } else {
    lbImg.removeAttribute("src");
    lbImg.style.display = "none";
    lbIcon.style.display = "";
    lbIcon.style.color = ev.color || "#0099ff";
  }
  lbName.textContent = ev.name || "";
  lbDate.textContent = ev.dateText || "";
  lightbox.classList.add("open");
  document.body.style.overflow = "hidden";
}

export function closeDetail() {
  lightbox.classList.remove("open");
  document.body.style.overflow = "";
  lbImg.removeAttribute("src");
}

lightbox.addEventListener("click", function (e) {
  // close when clicking the backdrop or the close button (not the image itself)
  if (e.target === lightbox || e.target.classList.contains("lb-close")) {
    closeDetail();
  }
});

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && lightbox.classList.contains("open")) closeDetail();
});
