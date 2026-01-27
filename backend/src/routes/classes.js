const express = require('express');
const router = express.Router();
const classController = require('../controllers/classController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { validate } = require('../utils/validation');
const { auditLog } = require('../middleware/security');

// Routes publiques
router.get('/', classController.getAllClasses);
router.get('/:classId', classController.getClassById);

// Routes protégées
router.post(
    '/',
    authenticateToken,
    requireRole(['teacher']),
    validate('createClass'),
    auditLog('CREATE_CLASS'),
    classController.createClass
);

router.post(
    '/:classId/enroll',
    authenticateToken,
    requireRole(['student']),
    auditLog('ENROLL_STUDENT'),
    classController.enrollStudent
);

router.get(
    '/:classId/materials',
    authenticateToken,
    classController.getClassMaterials
);

module.exports = router;
