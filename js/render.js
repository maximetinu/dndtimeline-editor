// js/render.js
import { el, openDetail, CALENDAR_ICON } from "./lightbox.js";
import { yearLabel, dateText, relativeLabel, minutesToYMD } from "./dates.js";

function hexToRgb(hex) {
  hex = (hex || "#0079CC").replace("#", "");
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function rgba(c, a) {
  return "rgba(" + c.r + "," + c.g + "," + c.b + "," + a + ")";
}

function lighten(c, amt) {
  return {
    r: Math.round(c.r + (255 - c.r) * amt),
    g: Math.round(c.g + (255 - c.g) * amt),
    b: Math.round(c.b + (255 - c.b) * amt),
  };
}

function diamondSvg(fillColor, strokeColor) {
  return (
    '<svg width="31" height="30" viewBox="0 0 31 30" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M29.793 15L15.5 29.293L1.20703 15L15.5 0.707031L29.793 15Z" fill="' +
    fillColor +
    '" fill-opacity="0.85" stroke="' +
    strokeColor +
    '"/></svg>'
  );
}

export function renderTimeline(container, events) {
  container.innerHTML = "";
  const frag = document.createDocumentFragment();
  let prevMin = null, prevYear = null;

  for (const ev of events) {
    const { year } = minutesToYMD(ev.start_minutes);
    const showYear = prevYear === null || year !== prevYear;
    const rel = relativeLabel(prevMin, ev.start_minutes);
    const evDateText = dateText(ev.start_minutes);

    const base = hexToRgb(ev.color);
    const stroke = lighten(base, 0.25);
    const strokeStr = "rgb(" + stroke.r + "," + stroke.g + "," + stroke.b + ")";
    const bgStr = rgba(base, 0.5);

    const row = el("div", "row");

    // left date column
    let dateCol;
    if (showYear) {
      dateCol = el("div", "date-col");
      dateCol.appendChild(el("div", "year", yearLabel(year)));
      if (rel) dateCol.appendChild(el("div", "rel", rel));
    } else {
      dateCol = el("div", "date-col rel-only");
      dateCol.appendChild(el("div", "rel", rel || ""));
    }
    row.appendChild(dateCol);

    // node (diamond + stem)
    const node = el("div", "node");
    node.appendChild(el("div", "diamond", diamondSvg(bgStr, "#0099ff")));
    node.appendChild(el("div", "stem"));
    row.appendChild(node);

    // card
    const card = el("div", "card");
    card.style.backgroundColor = bgStr;
    card.style.borderColor = strokeStr;

    if (ev.imageUrl) {
      card.classList.add("has-image");
      const bg = el("div", "bg-img");
      bg.style.backgroundImage = 'url("' + ev.imageUrl + '")';
      card.appendChild(bg);
      // scrim: subtle dark + color tint for legibility over the image
      const scrim = el("div", "scrim");
      scrim.style.background =
        "linear-gradient(180deg, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.55) 100%), " +
        rgba(base, 0.35);
      card.appendChild(scrim);

      // expand hint icon (top-right, desktop hover)
      const hint = el(
        "div",
        "expand-hint",
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>'
      );
      card.appendChild(hint);
    }

    // mobile date pill (year + relative gap) — replaces the side column on phones
    const meta = el("div", "card-meta");
    meta.appendChild(el("span", "cm-year", "")).textContent = evDateText;
    if (rel) meta.appendChild(el("span", "cm-rel", "")).textContent = rel;
    card.appendChild(meta);

    // every event opens its detail view
    (function (event) {
      card.addEventListener("click", function () {
        openDetail({ ...event, dateText: dateText(event.start_minutes) });
      });
    })(ev);

    const inner = el("div", "inner");
    inner.appendChild(el("div", "icon", CALENDAR_ICON));
    const text = el("div", "text");
    text.appendChild(el("div", "name", "")).textContent = ev.name;
    text.appendChild(el("div", "sub", "")).textContent = evDateText;
    inner.appendChild(text);
    card.appendChild(inner);

    row.appendChild(card);
    frag.appendChild(row);

    prevMin = ev.start_minutes;
    prevYear = year;
  }

  container.appendChild(frag);

  // terminal node
  const end = el("div", "row");
  const endCol = el("div", "date-col");
  end.appendChild(endCol);
  const endNode = el("div", "end-node");
  endNode.appendChild(
    el("div", "diamond", diamondSvg("#27272A", "rgba(255,255,255,0.25)"))
  );
  endNode.appendChild(el("div", "stem"));
  end.appendChild(endNode);
  end.appendChild(el("div", "", ""));
  container.appendChild(end);

  // scroll-to-top button
  const toTop = el(
    "button",
    "to-top",
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>'
  );
  toTop.setAttribute("aria-label", "Volver arriba");
  document.body.appendChild(toTop);
  toTop.addEventListener("click", function () {
    container.scrollTo({ top: 0, behavior: "smooth" });
  });
  container.addEventListener("scroll", function () {
    toTop.classList.toggle("show", container.scrollTop > 600);
  });
}
