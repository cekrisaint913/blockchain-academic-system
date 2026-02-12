/*
 * Authentication Middleware
 *
 * Extrait l'identité utilisateur du JWT ou certificat
 * Attache userId et orgMSP à req.user
 */

'use strict';

const jwt = require('jsonwebtoken');
const fabricService = require('../services/fabricService');

/**
 * Middleware d'authentification
 * Extrait le token JWT et vérifie l'identité Fabric
 */
const authenticate = async (req, res, next) => {
    try {
        // Récupérer le token depuis le header Authorization
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'No token provided. Please include Authorization header with Bearer token.'
            });
        }

        const token = authHeader.substring(7); // Enlever "Bearer "

        // Vérifier le JWT
        const JWT_SECRET = process.env.JWT_SECRET || 'academic-blockchain-secret-change-in-production';

        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired token'
            });
        }

        // Extraire les informations utilisateur
        const { userId, orgMSP, role } = decoded;

        if (!userId || !orgMSP) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token payload. Missing userId or orgMSP.'
            });
        }

        // Vérifier que l'identité existe dans le wallet Fabric
        const exists = await fabricService.identityExists(userId);
        if (!exists) {
            return res.status(401).json({
                success: false,
                error: `Fabric identity "${userId}" not found in wallet. Please enroll first.`
            });
        }

        // Attacher les informations à la requête
        req.user = {
            userId,
            orgMSP,
            role, // 'teacher' ou 'student'
        };

        console.log(`✅ Authenticated user: ${userId} (${orgMSP}, ${role})`);

        next();

    } catch (error) {
        console.error('Authentication error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal authentication error'
        });
    }
};

/**
 * Middleware pour vérifier le rôle
 * @param {Array<string>} allowedRoles - Rôles autorisés (ex: ['teacher'])
 */
const authorize = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Not authenticated'
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: `Access denied. Required role: ${allowedRoles.join(' or ')}`
            });
        }

        next();
    };
};

/**
 * Générer un JWT pour un utilisateur
 * (Utilisé par le endpoint de login)
 */
const generateToken = (userId, orgMSP, role) => {
    const JWT_SECRET = process.env.JWT_SECRET || 'academic-blockchain-secret-change-in-production';
    const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

    return jwt.sign(
        { userId, orgMSP, role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
};

module.exports = {
    authenticate,
    authorize,
    generateToken
};
