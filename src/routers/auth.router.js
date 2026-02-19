const express = require('express');
const router = express.Router();
const { register, login, logout, getCurrentUser, getUserProfile, listCcas } = require('../controllers/auth.controller');

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', getCurrentUser);
router.get('/profile', getUserProfile);
router.get('/cca', listCcas);

module.exports = router;
