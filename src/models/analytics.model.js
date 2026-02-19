// src/models/analytics.model.js
import { supabase } from './supabaseClient.js';

// Count with simple equality filters
async function countRowsWhere(table, matchObj) {
  let q = supabase.from(table).select('*', { count: 'exact', head: true });
  if (matchObj) {
    for (const [k, v] of Object.entries(matchObj)) {
      q = q.filter(k, 'eq', v);
    }
  }
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

// Generic filter helper
function inFilter(q, col, ids) {
  // Build SQL IN list e.g. "(1,2,3)"
  const list = `(${ids.join(',')})`;
  return q.filter(col, 'in', list);
}

// Get the CCA where user is "exco"
async function getExcoCcaIdForUser(userId) {
  const { data, error } = await supabase
    .from('cca_membership')
    .select('cca_id, role')
    .filter('user_id', 'eq', userId)
    .filter('role', 'eq', 'exco')
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.cca_id || null;
}

async function getCcaById(ccaId) {
  const { data, error } = await supabase
    .from('cca')
    .select('cca_id, name, description, logo_path')
    .filter('cca_id', 'eq', ccaId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

// ----- event helpers -----
async function getEventIdsForCca(ccaId) {
  const { data, error } = await supabase
    .from('event')
    .select('event_id, start_datetime, end_datetime')
    .filter('cca_id', 'eq', ccaId);

  if (error) throw error;
  return data || [];
}

async function countAllEvents(ccaId) {
  return countRowsWhere('event', { cca_id: ccaId });
}

async function countActiveEvents(ccaId) {
  const nowIso = new Date().toISOString();
  const { count, error } = await supabase
    .from('event')
    .select('*', { count: 'exact', head: true })
    .filter('cca_id', 'eq', ccaId)
    .filter('end_datetime', 'gte', nowIso);
  if (error) throw error;
  return count || 0;
}

async function countMembers(ccaId) {
  // counts ALL roles in this CCA (member + exco)
  return countRowsWhere('cca_membership', { cca_id: ccaId });
}

// Counts for signups/attendance across all events of the CCA
async function countTotalSignups(ccaId) {
  const events = await getEventIdsForCca(ccaId);
  const ids = events.map(e => e.event_id);
  if (!ids.length) return 0;

  const q = supabase.from('event_signup').select('*', { count: 'exact', head: true });
  const { count, error } = await inFilter(q, 'event_id', ids);
  if (error) throw error;
  return count || 0;
}

async function countTotalAttendance(ccaId) {
  const events = await getEventIdsForCca(ccaId);
  const ids = events.map(e => e.event_id);
  if (!ids.length) return 0;

  // Attendance = status present OR has a scanned timestamp
  let q = supabase
    .from('event_signup')
    .select('*', { count: 'exact', head: true });
  q = inFilter(q, 'event_id', ids)
    .or('attendance_status.eq.present,attendance_scanned_at.not.is.null');

  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

// Signup trend by month for last N months — uses event_signup.signed_up_at
async function getSignupTrendByMonth(ccaId, months = 6) {
  const events = await getEventIdsForCca(ccaId);
  const ids = events.map(e => e.event_id);
  if (!ids.length) return [];

  const start = new Date();
  start.setMonth(start.getMonth() - (months - 1));
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  let q = supabase
    .from('event_signup')
    .select('event_id, signed_up_at');
  q = inFilter(q, 'event_id', ids)
    .filter('signed_up_at', 'gte', start.toISOString());

  const { data, error } = await q;
  if (error) throw error;

  // Build buckets per calendar month label like "2025-08"
  const buckets = {};
  for (let i = 0; i < months; i++) {
    const d = new Date(start);
    d.setMonth(start.getMonth() + i);
    const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
    buckets[key] = 0;
  }

  (data || []).forEach(row => {
    const d = new Date(row.signed_up_at);
    const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
    if (key in buckets) buckets[key] += 1;
  });

  return Object.keys(buckets).map(k => ({
    label: k,
    count: buckets[k],
  }));
}

// Top events by signups (include attended + date + title)
async function getTopEvents(ccaId, limit = 5) {
  const events = await getEventIdsForCca(ccaId);
  if (!events.length) return [];

  const ids = events.map(e => e.event_id);

  // Load signups
  let qs = supabase.from('event_signup').select('event_id');
  qs = inFilter(qs, 'event_id', ids);
  const { data: signupRows, error: sErr } = await qs;
  if (sErr) throw sErr;

  // Attendance (present OR scanned)
  let qa = supabase.from('event_signup').select('event_id, attendance_status, attendance_scanned_at');
  qa = inFilter(qa, 'event_id', ids);
  const { data: attendRows, error: aErr } = await qa;
  if (aErr) throw aErr;

  // Count per event
  const signupCount = {};
  signupRows?.forEach(r => {
    signupCount[r.event_id] = (signupCount[r.event_id] || 0) + 1;
  });

  const attendedCount = {};
  attendRows?.forEach(r => {
    const present = r.attendance_status === 'present' || !!r.attendance_scanned_at;
    if (present) attendedCount[r.event_id] = (attendedCount[r.event_id] || 0) + 1;
  });

  // Get titles + dates
  let qe = supabase.from('event').select('event_id, title, start_datetime');
  qe = inFilter(qe, 'event_id', ids);
  const { data: eventRows, error: eErr } = await qe;
  if (eErr) throw eErr;

  const combined = (eventRows || []).map(e => ({
    event_id: e.event_id,
    title: e.title,
    date: e.start_datetime,
    signups: signupCount[e.event_id] || 0,
    attended: attendedCount[e.event_id] || 0,
  }));

  combined.sort((a, b) => b.signups - a.signups);
  return combined.slice(0, limit);
}

export {
  getExcoCcaIdForUser,
  getCcaById,
  countMembers,
  countAllEvents,
  countActiveEvents,
  countTotalSignups,
  countTotalAttendance,
  getSignupTrendByMonth,
  getTopEvents,
};
