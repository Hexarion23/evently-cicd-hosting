import express from 'express';
import { register, login, logout, getCurrentUser, getUserProfile, listCcas } from '../controllers/auth.controller.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', getCurrentUser);
router.get('/profile', getUserProfile);
router.post('/cca', listCcas);

export default router;
