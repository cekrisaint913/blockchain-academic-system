

const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const { validate } = require('../utils/validation');
const { authLimiter } = require('../middleware/security');
const logger = require('../utils/logger');

// POST /api/auth/register - Enregistrer un nouvel utilisateur
router.post('/register', authLimiter, async (req, res, next) => {
    try {
        const { username, role, organization } = req.body;

        // Validation basique
        if (!username || !role) {
            return res.status(400).json({
                success: false,
                error: 'Username and role are required'
            });
        }

        if (!['student', 'teacher', 'admin'].includes(role)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid role. Must be student, teacher, or admin'
            });
        }

        const user = await authService.registerUser(username, role, organization || 'Org1');

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: user
        });
    } catch (error) {
        if (error.message.includes('already exists')) {
            return res.status(409).json({
                success: false,
                error: 'User already exists'
            });
        }
        next(error);
    }
});

// POST /api/auth/login - Connexion
router.post('/login', authLimiter, validate('login'), async (req, res, next) => {
    try {
        const { username, password } = req.body;

        const result = await authService.login(username, password);

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.warn(`Login attempt failed for ${req.body.username}`);
        return res.status(401).json({
            success: false,
            error: 'Invalid credentials'
        });
    }
});

// GET /api/auth/me - Informations utilisateur actuel
router.get('/me', require('../middleware/auth').authenticateToken, (req, res) => {
    res.json({
        success: true,
        data: {
            username: req.user.username,
            role: req.user.role,
            organization: req.user.organization
        }
    });
});

module.exports = router;
