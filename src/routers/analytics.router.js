// src/routers/analytics.router.js
import express from 'express';
import * as ctrl from '../controllers/analytics.controller.js';

const router = express.Router();

// All endpoints assume JWT cookie auth (same as the rest of your app)
router.get('/my-cca', ctrl.getMyCca);
router.get('/overview', ctrl.getOverview);
router.get('/signup-trend', ctrl.getSignupTrend);
router.get('/attendance', ctrl.getAttendanceBreakdown);
router.get('/top-events', ctrl.getTopEventsBySignups);

export default router;
