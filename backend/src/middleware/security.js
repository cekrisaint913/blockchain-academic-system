

const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const logger = require('../utils/logger');

// Rate limiting par IP
exports.limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: 'Too many requests from this IP, please try again later',
    handler: (req, res) => {
        logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
            success: false,
            error: 'Too many requests, please try again later'
        });
    }
});

// Rate limiting strict pour l'authentification
exports.authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    message: 'Too many login attempts, please try again later'
});

// Headers de sécurité
exports.securityHeaders = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
});

// Validation et sanitization des inputs
exports.sanitizeInput = (req, res, next) => {
    // Supprimer les caractères potentiellement dangereux
    const sanitize = (obj) => {
        for (let key in obj) {
            if (typeof obj[key] === 'string') {
                obj[key] = obj[key].replace(/[<>]/g, '');
            } else if (typeof obj[key] === 'object') {
                sanitize(obj[key]);
            }
        }
    };
    
    if (req.body) sanitize(req.body);
    if (req.query) sanitize(req.query);
    if (req.params) sanitize(req.params);
    
    next();
};

// Logging des requêtes sensibles
exports.auditLog = (action) => {
    return (req, res, next) => {
        logger.info({
            action,
            user: req.user?.username || 'anonymous',
            ip: req.ip,
            timestamp: new Date().toISOString(),
            path: req.path,
            method: req.method
        });
        next();
    };
};
