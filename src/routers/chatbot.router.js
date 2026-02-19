import express from 'express';
import { chatWithGemini } from '../controllers/chatbot.controller.js';

const router = express.Router();

router.post('/', chatWithGemini);

export default router;