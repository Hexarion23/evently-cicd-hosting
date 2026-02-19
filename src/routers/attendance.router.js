import express from "express";
import * as attendanceController from "../controllers/attendance.controller.js";

const router = express.Router();

router.post("/scan", attendanceController.scanAttendance);

export default router;