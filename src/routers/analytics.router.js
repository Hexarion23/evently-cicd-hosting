// src/routers/analytics.router.js
const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/analytics.controller');

// All endpoints assume JWT cookie auth (same as the rest of your app)
router.get('/my-cca', ctrl.getMyCca);
router.get('/overview', ctrl.getOverview);
router.get('/signup-trend', ctrl.getSignupTrend);
router.get('/attendance', ctrl.getAttendanceBreakdown);
router.get('/top-events', ctrl.getTopEventsBySignups);

module.exports = router;
