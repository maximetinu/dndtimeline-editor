// js/main.js
import { renderTimeline } from "./render.js";
import { SAMPLE_EVENTS } from "./sample-data.js";

const container = document.getElementById("chronicle");
renderTimeline(container, SAMPLE_EVENTS);
