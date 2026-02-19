// src/public/analytics.js
async function getJSON(url) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Analytics error: ${msg || res.statusText} (${url})`);
  }
  return res.json();
}

function fmt(num) {
  if (num == null) return '—';
  return new Intl.NumberFormat().format(num);
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

let signupChart;
let attendanceChart;

async function init() {
  try {
    const me = await getJSON('/api/analytics/my-cca');
    const ccaId = me.cca_id;

    const ccaNameEl = document.getElementById('ccaName');
    if (ccaNameEl) {
      ccaNameEl.innerHTML = `Your CCA: <span class="fw-semibold">${me.name || 'Unknown'}</span>`;
    }

    const overview = await getJSON(`/api/analytics/overview?cca_id=${ccaId}`);
    document.getElementById('kpiMembers').textContent = fmt(overview.members);
    document.getElementById('kpiActiveEvents').textContent = fmt(overview.activeEvents);
    document.getElementById('kpiAllEvents').textContent = fmt(overview.allEvents);
    document.getElementById('kpiSignups').textContent = fmt(overview.totalSignups);
    document.getElementById('kpiAttendance').textContent = `${fmt(overview.attendanceRate)}%`;

    const trend = await getJSON(`/api/analytics/signup-trend?cca_id=${ccaId}&months=6`);
    const labels = trend.series.map(p => p.label);
    const values = trend.series.map(p => p.count);

    const stx = document.getElementById('signupTrend').getContext('2d');
    if (signupChart) signupChart.destroy();
    signupChart = new Chart(stx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Signups',
          data: values,
          tension: 0.35,
          borderWidth: 3,
          pointRadius: 3,
          borderColor: '#d8292f',
          backgroundColor: 'rgba(216,41,47,0.15)',
          fill: true,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
        plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } }
      },
    });

    const breakdown = await getJSON(`/api/analytics/attendance?cca_id=${ccaId}`);
    const atx = document.getElementById('attendanceBreakdown').getContext('2d');
    if (attendanceChart) attendanceChart.destroy();
    attendanceChart = new Chart(atx, {
      type: 'doughnut',
      data: {
        labels: ['Attended', 'No-Show'],
        datasets: [{
          data: [breakdown.attended, breakdown.noShow],
          backgroundColor: ['#d8292f', '#e9ecef'],
          hoverOffset: 5,
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

    // UPDATED TABLE LOGIC WITH DEBUGGING
    const top = await getJSON(`/api/analytics/top-events?cca_id=${ccaId}&limit=5`);
    const tbody = document.getElementById('topEventsBody');
    tbody.innerHTML = '';

    if (!top.events.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-muted">No events found.</td></tr>';
    } else {
      top.events.forEach(ev => {
        console.log('Event data received:', ev); // Debug logging
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${ev.title || 'Untitled'}</td>
          <td class="text-end">${fmt(ev.signups)}</td>
          <td class="text-end">${fmt(ev.attended)}</td>
          <td class="text-end">${fmtDate(ev.date)}</td>
        `;
        
        // Check if event_id exists before adding click handler
        if (ev.event_id) {
          tr.addEventListener('click', () => {
            console.log('Navigating to event command center with ID:', ev.event_id);
            window.location.href = `event-command-center.html?event_id=${ev.event_id}`;
          });
          tr.style.cursor = 'pointer';
        } else {
          console.warn('Event missing event_id:', ev);
          tr.style.cursor = 'default';
        }
        
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    console.error('Analytics initialization error:', err);
  }
}

document.addEventListener('DOMContentLoaded', init);