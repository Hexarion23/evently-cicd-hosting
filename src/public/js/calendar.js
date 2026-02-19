// =========================================================
// calendar.js — Horizontal 7-Column SP Glass Calendar
// =========================================================

import { supabase } from "./data.js";

// In-memory state
let upcomingEvents = [];
let pastEvents = [];
let monthKeys = [];
let currentMonthIndex = 0;

// Load calendar
document.addEventListener("DOMContentLoaded", () => {
  initCalendar().catch((err) => console.error("Calendar init error:", err));
});

// =========================================================
// Init
// =========================================================
async function initCalendar() {
  const backendUser = await getBackendUser();
  if (!backendUser) return;

  const allEvents = await loadRegisteredEvents(backendUser.id);

  // Sort all events
  allEvents.sort((a, b) => new Date(a.date) - new Date(b.date));

  const now = new Date();

  upcomingEvents = allEvents.filter((e) => new Date(e.date) >= now);
  pastEvents = allEvents.filter((e) => new Date(e.date) < now);

  updateSummaryCards(allEvents);

  // Generate month keys
  monthKeys = Array.from(
    new Set(upcomingEvents.map((e) => toMonthKey(e.date))),
  ).sort();

  setupTabs();
  setupMonthNav();
  setupFilters();
  renderListView();
  renderPastView();

  if (monthKeys.length === 0) renderEmptyCalendar();
  else {
    currentMonthIndex = 0;
    renderCalendarMonth();
  }
}

// =========================================================
// Backend auth
// =========================================================
async function getBackendUser() {
  try {
    const res = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "include",
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.user || null;
  } catch {
    return null;
  }
}

// =========================================================
// Load registered events
// =========================================================

async function loadRegisteredEvents(userId) {
  const { data: signup } = await supabase
    .from("event_signup")
    .select("event_id")
    .eq("user_id", userId);

  if (!signup || signup.length === 0) return [];

  const { data: events } = await supabase
    .from("event")
    .select("*")
    .in(
      "event_id",
      signup.map((s) => s.event_id),
    );

  return events.map((ev) => ({
    id: ev.event_id,
    title: ev.title,
    date: ev.start_datetime,
    venue: ev.location,
    // ADDED: Store category for filtering
    category: ev.cca_points_category || "Uncategorized",
    time: formatTime(ev.start_datetime),
    points: mapPoints(ev.cca_points_category),
  }));
}

function mapPoints(cat) {
  if (cat === "Service" || cat === "Community Service") return 10;
  if (cat === "Enrichment") return 5;
  if (cat === "Participation") return 2;
  return 0;
}

// =========================================================
// Summary cards
// =========================================================
function updateSummaryCards(events) {
  document.getElementById("totalRegistered").textContent = events.length;
  document.getElementById("totalPoints").textContent = events.reduce(
    (s, e) => s + e.points,
    0,
  );
}

// =========================================================
// Tabs switching
// =========================================================
function setupTabs() {
  const tabs = document.querySelectorAll(".calendar-tab");
  const toolbar = document.getElementById("filterToolbar"); // Reference toolbar
  const views = {
    calendar: document.getElementById("calendarView"),
    list: document.getElementById("listView"),
    past: document.getElementById("pastView"),
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const view = tab.dataset.view;

      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      // Toggle View Sections
      Object.entries(views).forEach(([key, el]) => {
        el.classList.toggle("d-none", key !== view);
        el.setAttribute("aria-hidden", key !== view);
      });

      // Toggle Toolbar Visibility
      // Show toolbar if view is 'list' or 'past', hide for 'calendar'
      if (view === "list" || view === "past") {
        toolbar.classList.remove("d-none");
        // Trigger a render to ensure current filters are applied immediately
        if (view === "list") renderListView();
        if (view === "past") renderPastView();
      } else {
        toolbar.classList.add("d-none");
      }
    });
  });
}

// =========================================================
// Month navigation
// =========================================================
function setupMonthNav() {
  const prev = document.getElementById("btnPrevMonth");
  const next = document.getElementById("btnNextMonth");

  prev.addEventListener("click", () => {
    currentMonthIndex = Math.max(0, currentMonthIndex - 1);
    renderCalendarMonth();
  });

  next.addEventListener("click", () => {
    currentMonthIndex = Math.min(monthKeys.length - 1, currentMonthIndex + 1);
    renderCalendarMonth();
  });

  updateMonthNavState();
}

function updateMonthNavState() {
  const prev = document.getElementById("btnPrevMonth");
  const next = document.getElementById("btnNextMonth");

  prev.disabled = currentMonthIndex === 0;
  next.disabled = currentMonthIndex === monthKeys.length - 1;
}

// =========================================================
// EMPTY calendar
// =========================================================
function renderEmptyCalendar() {
  document.getElementById("calendarMonthLabel").textContent =
    "No upcoming events";
  document.getElementById("calendarStrip").innerHTML = `
    <div class="calendar-empty card shadow-sm">
      <div class="card-body text-center py-5">
        <i class="bi bi-calendar-x display-4 text-muted"></i>
        <p class="mt-3 mb-0 text-muted">You don't have any upcoming events.</p>
      </div>
    </div>
  `;
}

// =========================================================
// ⭐ FULL MONTH GRID (Horizontal 7 Columns) ⭐
// Matches EXACTLY your styles.css
// =========================================================
function renderCalendarMonth() {
  const monthKey = monthKeys[currentMonthIndex];
  const [year, month] = monthKey.split("-").map(Number);

  document.getElementById("calendarMonthLabel").textContent =
    formatMonthLabel(monthKey);

  updateMonthNavState();

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  const startOffset = firstDay.getDay(); // Sunday = 0
  const totalDays = lastDay.getDate();

  const monthEvents = upcomingEvents.filter(
    (e) => toMonthKey(e.date) === monthKey,
  );

  const grouped = groupByDate(monthEvents);

  let html = ``;

  // WEEKDAY HEADERS
  const headers = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  headers.forEach((h) => {
    html += `<div class="calendar-grid-header">${h}</div>`;
  });

  // Blank cells before day 1
  for (let i = 0; i < startOffset; i++) {
    html += `<div class="calendar-grid-cell empty"></div>`;
  }

  // Day cells
  for (let day = 1; day <= totalDays; day++) {
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const events = grouped[dateKey] || [];

    html += `
      <div class="calendar-grid-cell">
        <div class="calendar-grid-date">${day}</div>
        <div class="calendar-grid-events">
          ${
            events.length
              ? events
                  .map(
                    (ev) => `
              <div class="calendar-grid-event" data-id="${ev.id}">
                ${ev.title} <br><small>${ev.time}</small>
              </div>`,
                  )
                  .join("")
              : `<span class="no-events">No events</span>`
          }
        </div>
      </div>
    `;
  }

  document.getElementById("calendarStrip").innerHTML = html;

  attachEventClicks(".calendar-grid-event");
}

// =========================================================
// List view + past view
// =========================================================
function renderListView() {
  const container = document.getElementById("listEvents");
  
  const filtered = getFilteredEvents(upcomingEvents); 

  if (filtered.length === 0) {
    container.innerHTML = `<div class="card shadow-sm"><div class="card-body text-center py-4 text-muted">No events found</div></div>`;
    return;
  }

  container.innerHTML = filtered.map((ev) => renderListCard(ev)).join("");
  attachEventClicks("#listEvents .calendar-list-card");
}

function renderPastView() {
  const container = document.getElementById("pastEvents");
  
  const filtered = getFilteredEvents(pastEvents);

  if (filtered.length === 0) {
    container.innerHTML = `<div class="card shadow-sm"><div class="card-body text-center py-4 text-muted">No events found</div></div>`;
    return;
  }

  container.innerHTML = filtered.map((ev) => renderListCard(ev)).join("");
  attachEventClicks("#pastEvents .calendar-list-card");
}

function renderListCard(ev) {
  const d = dateInfo(ev.date);

  return `
    <div class="card border-0 shadow-sm mb-3 calendar-list-card" data-id="${ev.id}">
      <div class="card-body d-flex align-items-center gap-3">
        <div class="calendar-list-date">
          <div class="calendar-list-day">${d.day}</div>
          <div class="calendar-list-month">${d.month}</div>
          <div class="calendar-list-weekday">${d.weekday}</div>
        </div>

        <div class="flex-grow-1">
          <h5 class="fw-semibold mb-1">${ev.title}</h5>
          <div class="text-muted small mb-1">
            <i class="bi bi-clock"></i> ${ev.time}
            &nbsp;&middot;&nbsp;
            <i class="bi bi-geo-alt"></i> ${ev.venue}
          </div>
        </div>

        <div class="text-end">
          <span class="badge bg-primary-subtle text-primary-emphasis">${ev.points} pts</span>
        </div>
      </div>
    </div>
  `;
}

// =========================================================
// Helpers
// =========================================================
function formatTime(str) {
  return new Date(str).toLocaleTimeString("en-SG", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dateInfo(str) {
  const d = new Date(str);
  return {
    day: d.getDate(),
    month: d.toLocaleString("en-SG", { month: "short" }),
    weekday: d.toLocaleString("en-SG", { weekday: "short" }),
  };
}

function toMonthKey(str) {
  const d = new Date(str);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function toDateKey(str) {
  const d = new Date(str);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function formatMonthLabel(key) {
  const [year, m] = key.split("-");
  const d = new Date(year, m - 1, 1);
  return d.toLocaleString("en-SG", { month: "long", year: "numeric" });
}

function groupByDate(events) {
  const obj = {};
  events.forEach((e) => {
    const k = toDateKey(e.date);
    if (!obj[k]) obj[k] = [];
    obj[k].push(e);
  });
  return obj;
}

function attachEventClicks(selector) {
  document.querySelectorAll(selector).forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.dataset.id;
      if (id) window.location.href = `event-details.html?id=${id}`;
    });
  });
}

// =========================================================
// Search & Filter Logic
// =========================================================
function setupFilters() {
  const searchInput = document.getElementById("searchInput");
  const catFilter = document.getElementById("categoryFilter");

  // Re-render when user types or selects
  const triggerUpdate = () => {
    // Check which view is currently active (List or Past)
    const listActive = !document
      .getElementById("listView")
      .classList.contains("d-none");
    const pastActive = !document
      .getElementById("pastView")
      .classList.contains("d-none");

    if (listActive) renderListView();
    if (pastActive) renderPastView();
  };

  searchInput.addEventListener("input", triggerUpdate);
  catFilter.addEventListener("change", triggerUpdate);
}

function getFilteredEvents(sourceArray) {
  const term = document
    .getElementById("searchInput")
    .value.toLowerCase()
    .trim();
  const cat = document.getElementById("categoryFilter").value;

  return sourceArray.filter((ev) => {
    // 1. Search Text Match (Title or Venue)
    const textMatch =
      ev.title.toLowerCase().includes(term) ||
      (ev.venue && ev.venue.toLowerCase().includes(term));

    // 2. Category Match
    let catMatch = true;
    if (cat !== "all") {
      // Handle "Service" covering "Community Service" as well if needed
      if (cat === "Service") {
        catMatch = ev.category.includes("Service");
      } else {
        catMatch = ev.category === cat;
      }
    }

    return textMatch && catMatch;
  });
}
