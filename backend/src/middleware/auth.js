

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// Middleware d'authentification JWT
exports.authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        logger.warn('Access attempt without token');
        return res.status(401).json({
            success: false,
            error: 'Access token required'
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            logger.warn(`Invalid token attempt: ${err.message}`);
            return res.status(403).json({
                success: false,
                error: 'Invalid or expired token'
            });
        }

        req.user = user;
        logger.debug(`User authenticated: ${user.username}`);
        next();
    });
};

// Middleware de vérification de rôle
exports.requireRole = (roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            logger.warn(`Access denied for role ${req.user.role} on ${req.path}`);
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions'
            });
        }
        next();
    };
};

// Middleware anti-CSRF (simplifié pour la démo)
exports.csrfProtection = (req, res, next) => {
    // Vérifier que la requête vient bien du frontend attendu
    const origin = req.headers.origin;
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'];
    
    if (req.method !== 'GET' && !allowedOrigins.includes(origin)) {
        logger.warn(`CSRF attempt from ${origin}`);
        return res.status(403).json({
            success: false,
            error: 'Invalid origin'
        });
    }
    next();
};
