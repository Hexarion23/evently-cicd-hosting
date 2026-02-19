const express = require("express");
const router = express.Router();

const attendanceController = require("../controllers/attendance.controller");
router.post("/scan", attendanceController.scanAttendance);

module.exports = router;