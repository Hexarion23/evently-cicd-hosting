// src/controllers/analytics.controller.js
const jwt = require('jsonwebtoken');
const model = require('../models/analytics.model');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_change_me';

// ----- helpers -----
function getUserFromCookie(req) {
  const token = req.cookies?.token;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET); // { id, admin_number, role }
  } catch {
    return null;
  }
}

async function resolveCcaId(req) {
  if (req.query?.cca_id) return Number(req.query.cca_id);
  const user = getUserFromCookie(req);
  if (!user) throw { status: 401, message: 'Not authenticated' };
  const ccaId = await model.getExcoCcaIdForUser(user.id);
  if (!ccaId) throw { status: 403, message: 'User is not an Exco for any CCA' };
  return ccaId;
}

// ----- controllers -----
async function getMyCca(req, res) {
  try {
    const user = getUserFromCookie(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const ccaId = await model.getExcoCcaIdForUser(user.id);
    if (!ccaId) return res.status(403).json({ error: 'User is not an Exco for any CCA' });

    const cca = await model.getCcaById(ccaId);
    return res.json({ cca_id: ccaId, name: cca?.name || 'Unknown' });
  } catch (err) {
    console.error('my-cca error:', err);
    return res.status(err.status || 500).json({ error: err.message || 'Internal error' });
  }
}

async function getOverview(req, res) {
  try {
    const ccaId = await resolveCcaId(req);

    const [members, activeEvents, allEvents, totalSignups, attended] =
      await Promise.all([
        model.countMembers(ccaId),
        model.countActiveEvents(ccaId),
        model.countAllEvents(ccaId),
        model.countTotalSignups(ccaId),
        model.countTotalAttendance(ccaId),
      ]);

    const attendanceRate = totalSignups > 0 ? Math.round((attended / totalSignups) * 100) : 0;

    return res.json({
      cca_id: ccaId,
      members,
      activeEvents,
      allEvents,
      totalSignups,
      attendanceRate,
    });
  } catch (err) {
    console.error('overview error:', err);
    return res.status(err.status || 500).json({ error: err.message || 'Internal error' });
  }
}

async function getSignupTrend(req, res) {
  try {
    const ccaId = await resolveCcaId(req);
    const months = Number(req.query.months || 6);
    const trend = await model.getSignupTrendByMonth(ccaId, months);
    return res.json({ cca_id: ccaId, months, series: trend });
  } catch (err) {
    console.error('signup-trend error:', err);
    return res.status(err.status || 500).json({ error: err.message || 'Internal error' });
  }
}

async function getAttendanceBreakdown(req, res) {
  try {
    const ccaId = await resolveCcaId(req);
    const [signups, attended] = await Promise.all([
      model.countTotalSignups(ccaId),
      model.countTotalAttendance(ccaId),
    ]);
    const noShow = Math.max(signups - attended, 0);
    return res.json({ cca_id: ccaId, attended, noShow, totalSignups: signups });
  } catch (err) {
    console.error('attendance error:', err);
    return res.status(err.status || 500).json({ error: err.message || 'Internal error' });
  }
}

async function getTopEventsBySignups(req, res) {
  try {
    const ccaId = await resolveCcaId(req);
    const limit = Number(req.query.limit || 5);
    const rows = await model.getTopEvents(ccaId, limit);
    return res.json({ cca_id: ccaId, events: rows });
  } catch (err) {
    console.error('top-events error:', err);
    return res.status(err.status || 500).json({ error: err.message || 'Internal error' });
  }
}

module.exports = {
  getMyCca,
  getOverview,
  getSignupTrend,
  getAttendanceBreakdown,
  getTopEventsBySignups,
};
