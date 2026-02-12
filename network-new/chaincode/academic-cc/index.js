/*
 * Academic Chaincode - Main Entry Point
 *
 * Architecture modulaire:
 * - lib/class.js: Gestion des classes
 * - lib/material.js: Gestion des supports de cours (IPFS)
 * - lib/exam.js: Gestion des examens et corrections
 * - lib/grade.js: Gestion des notes (avec CouchDB queries)
 * - index.js: Point d'entrée et contrat principal (legacy)
 *
 * Organizations: SchoolOrg (SchoolMSP) + StudentsOrg (StudentsMSP)
 * Channel: academic-channel
 */

'use strict';

const ClassContract = require('./lib/class');
const MaterialContract = require('./lib/material');
const ExamContract = require('./lib/exam');
const GradeContract = require('./lib/grade');
const { Contract } = require('fabric-contract-api');

/**
 * Contrat principal pour les fonctions générales
 */
class AcademicContract extends Contract {

    constructor() {
        super('AcademicContract');
    }

    /**
     * Get deterministic timestamp from transaction (same across all peers)
     */
    _getTxTimestamp(ctx) {
        const timestamp = ctx.stub.getTxTimestamp();
        const seconds = timestamp.seconds.low || timestamp.seconds;
        return new Date(seconds * 1000).toISOString();
    }

    // ==================== INITIALIZATION ====================

    async InitLedger(ctx) {
        console.info('============= START : Initialize Ledger ===========');

        // Option: Créer des données de test
        // Pour l'instant, ledger vide
        const info = {
            message: 'Academic Blockchain Ledger initialized successfully',
            timestamp: this._getTxTimestamp(ctx),
            channel: ctx.stub.getChannelID(),
            organizations: ['SchoolMSP', 'StudentsMSP'],
        };

        console.info('Ledger initialized:', JSON.stringify(info));
        console.info('============= END : Initialize Ledger ===========');

        return JSON.stringify(info);
    }

    // ==================== MATERIALS (IPFS) ====================

    async UploadMaterial(ctx, materialId, classId, title, materialType, ipfsHash, uploadedBy) {
        console.info('============= START : Upload Material ===========');

        // Vérifier que l'appelant est SchoolOrg
        const mspID = ctx.clientIdentity.getMSPID();
        if (mspID !== 'SchoolMSP') {
            throw new Error('Access Denied: Only SchoolOrg members can upload materials');
        }

        // Vérifier que la classe existe
        const classAsBytes = await ctx.stub.getState(classId);
        if (!classAsBytes || classAsBytes.length === 0) {
            throw new Error(`Class ${classId} does not exist`);
        }

        const material = {
            docType: 'material',
            materialId: materialId,
            classId: classId,
            title: title,
            materialType: materialType, // lecture, lab, exercise
            ipfsHash: ipfsHash,
            uploadedBy: uploadedBy,
            uploadedAt: this._getTxTimestamp(ctx),
        };

        await ctx.stub.putState(materialId, Buffer.from(JSON.stringify(material)));

        ctx.stub.setEvent('MaterialUploaded', Buffer.from(JSON.stringify({
            materialId: materialId,
            classId: classId,
            uploadedBy: uploadedBy,
        })));

        console.info('============= END : Upload Material ===========');
        return JSON.stringify(material);
    }

    async GetClassMaterials(ctx, classId) {
        const allResults = [];
        const iterator = await ctx.stub.getStateByRange('', '');
        let result = await iterator.next();

        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;
            try {
                record = JSON.parse(strValue);
                if (record.docType === 'material' && record.classId === classId) {
                    allResults.push(record);
                }
            } catch (err) {
                console.log(err);
            }
            result = await iterator.next();
        }
        await iterator.close();
        return JSON.stringify(allResults);
    }

    // ==================== EXAMS ====================

    async CreateExam(ctx, examId, classId, title, examDate, description) {
        console.info('============= START : Create Exam ===========');

        // Seulement SchoolOrg peut créer des examens
        const mspID = ctx.clientIdentity.getMSPID();
        if (mspID !== 'SchoolMSP') {
            throw new Error('Access Denied: Only SchoolOrg members can create exams');
        }

        // Vérifier que la classe existe
        const classAsBytes = await ctx.stub.getState(classId);
        if (!classAsBytes || classAsBytes.length === 0) {
            throw new Error(`Class ${classId} does not exist`);
        }

        const exam = {
            docType: 'exam',
            examId: examId,
            classId: classId,
            title: title,
            examDate: examDate,
            description: description || '',
            createdAt: this._getTxTimestamp(ctx),
        };

        await ctx.stub.putState(examId, Buffer.from(JSON.stringify(exam)));

        ctx.stub.setEvent('ExamCreated', Buffer.from(JSON.stringify({
            examId: examId,
            classId: classId,
        })));

        console.info('============= END : Create Exam ===========');
        return JSON.stringify(exam);
    }

    async GetExam(ctx, examId) {
        const examAsBytes = await ctx.stub.getState(examId);
        if (!examAsBytes || examAsBytes.length === 0) {
            throw new Error(`Exam ${examId} does not exist`);
        }
        return examAsBytes.toString();
    }

    async GetAllExams(ctx) {
        const allResults = [];
        const iterator = await ctx.stub.getStateByRange('', '');
        let result = await iterator.next();

        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;
            try {
                record = JSON.parse(strValue);
                if (record.docType === 'exam') {
                    allResults.push(record);
                }
            } catch (err) {
                console.log(err);
            }
            result = await iterator.next();
        }
        await iterator.close();
        return JSON.stringify(allResults);
    }

    async GetClassExams(ctx, classId) {
        const allResults = [];
        const iterator = await ctx.stub.getStateByRange('', '');
        let result = await iterator.next();

        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;
            try {
                record = JSON.parse(strValue);
                if (record.docType === 'exam' && record.classId === classId) {
                    allResults.push(record);
                }
            } catch (err) {
                console.log(err);
            }
            result = await iterator.next();
        }
        await iterator.close();
        return JSON.stringify(allResults);
    }

    // ==================== GRADES ====================

    async SubmitGrade(ctx, gradeId, examId, studentId, score, maxScore, comments) {
        console.info('============= START : Submit Grade ===========');

        // Seulement SchoolOrg peut soumettre des notes
        const mspID = ctx.clientIdentity.getMSPID();
        if (mspID !== 'SchoolMSP') {
            throw new Error('Access Denied: Only SchoolOrg members can submit grades');
        }

        // Vérifier que l'examen existe
        const examAsBytes = await ctx.stub.getState(examId);
        if (!examAsBytes || examAsBytes.length === 0) {
            throw new Error(`Exam ${examId} does not exist`);
        }

        const grade = {
            docType: 'grade',
            gradeId: gradeId,
            examId: examId,
            studentId: studentId,
            score: parseFloat(score),
            maxScore: parseFloat(maxScore),
            comments: comments || '',
            isPublished: false,
            submittedAt: this._getTxTimestamp(ctx),
        };

        await ctx.stub.putState(gradeId, Buffer.from(JSON.stringify(grade)));

        ctx.stub.setEvent('GradeSubmitted', Buffer.from(JSON.stringify({
            gradeId: gradeId,
            examId: examId,
            studentId: studentId,
        })));

        console.info('============= END : Submit Grade ===========');
        return JSON.stringify(grade);
    }

    async PublishGrade(ctx, gradeId) {
        // Seulement SchoolOrg peut publier des notes
        const mspID = ctx.clientIdentity.getMSPID();
        if (mspID !== 'SchoolMSP') {
            throw new Error('Access Denied: Only SchoolOrg members can publish grades');
        }

        const gradeAsBytes = await ctx.stub.getState(gradeId);
        if (!gradeAsBytes || gradeAsBytes.length === 0) {
            throw new Error(`Grade ${gradeId} does not exist`);
        }

        const grade = JSON.parse(gradeAsBytes.toString());
        grade.isPublished = true;
        grade.publishedAt = this._getTxTimestamp(ctx);

        await ctx.stub.putState(gradeId, Buffer.from(JSON.stringify(grade)));

        ctx.stub.setEvent('GradePublished', Buffer.from(JSON.stringify({
            gradeId: gradeId,
            studentId: grade.studentId,
        })));

        return JSON.stringify(grade);
    }

    async GetGrade(ctx, gradeId) {
        const gradeAsBytes = await ctx.stub.getState(gradeId);
        if (!gradeAsBytes || gradeAsBytes.length === 0) {
            throw new Error(`Grade ${gradeId} does not exist`);
        }

        const grade = JSON.parse(gradeAsBytes.toString());

        // Si c'est un étudiant, il ne peut voir que ses propres notes publiées
        const mspID = ctx.clientIdentity.getMSPID();
        if (mspID === 'StudentsMSP') {
            const callerID = ctx.clientIdentity.getID();
            const match = callerID.match(/CN=([^,/]+)/);
            const caller = match ? match[1] : callerID;

            if (grade.studentId !== caller) {
                throw new Error('Access Denied: You can only view your own grades');
            }

            if (!grade.isPublished) {
                throw new Error('Grade not yet published by the teacher');
            }
        }

        return gradeAsBytes.toString();
    }

    async GetAllGrades(ctx) {
        // Seulement SchoolOrg peut voir toutes les notes
        const mspID = ctx.clientIdentity.getMSPID();
        if (mspID !== 'SchoolMSP') {
            throw new Error('Access Denied: Only SchoolOrg members can view all grades');
        }

        const allResults = [];
        const iterator = await ctx.stub.getStateByRange('', '');
        let result = await iterator.next();

        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;
            try {
                record = JSON.parse(strValue);
                if (record.docType === 'grade') {
                    allResults.push(record);
                }
            } catch (err) {
                console.log(err);
            }
            result = await iterator.next();
        }
        await iterator.close();
        return JSON.stringify(allResults);
    }

    async GetStudentGrades(ctx, studentId) {
        // Les étudiants peuvent uniquement voir leurs propres notes (publiées)
        const mspID = ctx.clientIdentity.getMSPID();
        const callerID = ctx.clientIdentity.getID();
        const match = callerID.match(/CN=([^,/]+)/);
        const caller = match ? match[1] : callerID;

        // Si c'est un étudiant, il ne peut voir que ses propres notes
        if (mspID === 'StudentsMSP' && caller !== studentId) {
            throw new Error('Access Denied: Students can only view their own grades');
        }

        const allResults = [];
        const iterator = await ctx.stub.getStateByRange('', '');
        let result = await iterator.next();

        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;
            try {
                record = JSON.parse(strValue);
                // Pour les étudiants: seulement les notes publiées
                if (record.docType === 'grade' && record.studentId === studentId) {
                    if (mspID === 'StudentsMSP' && !record.isPublished) {
                        // Skip non-published grades for students
                        result = await iterator.next();
                        continue;
                    }
                    allResults.push(record);
                }
            } catch (err) {
                console.log(err);
            }
            result = await iterator.next();
        }
        await iterator.close();
        return JSON.stringify(allResults);
    }

    async GetExamGrades(ctx, examId) {
        // Seulement SchoolOrg peut voir toutes les notes d'un examen
        const mspID = ctx.clientIdentity.getMSPID();
        if (mspID !== 'SchoolMSP') {
            throw new Error('Access Denied: Only SchoolOrg members can view exam grades');
        }

        const allResults = [];
        const iterator = await ctx.stub.getStateByRange('', '');
        let result = await iterator.next();

        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;
            try {
                record = JSON.parse(strValue);
                if (record.docType === 'grade' && record.examId === examId) {
                    allResults.push(record);
                }
            } catch (err) {
                console.log(err);
            }
            result = await iterator.next();
        }
        await iterator.close();
        return JSON.stringify(allResults);
    }
}

// Exporter les cinq contrats
module.exports.contracts = [AcademicContract, ClassContract, MaterialContract, ExamContract, GradeContract];
