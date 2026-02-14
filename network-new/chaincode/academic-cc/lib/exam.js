/*
 * Exam Management Smart Contract
 *
 * Contrôle d'accès:
 * - Création/Upload: SchoolMSP uniquement (teachers)
 * - Accès aux examens: Étudiants inscrits + Teachers
 * - Accès aux corrections: 24h après examDate + Enrollment
 * - Stockage IPFS off-chain, hash stocké on-chain
 */

'use strict';

const { Contract } = require('fabric-contract-api');

class ExamContract extends Contract {

    // ==================== CONTRÔLES D'ACCÈS ====================

    /**
     * Vérifie si l'appelant appartient à SchoolOrg (teachers/admin)
     */
    _isSchoolMember(ctx) {
        const mspID = ctx.clientIdentity.getMSPID();
        return mspID === 'SchoolMSP';
    }

    /**
     * Vérifie si l'appelant appartient à StudentsOrg
     */
    _isStudentMember(ctx) {
        const mspID = ctx.clientIdentity.getMSPID();
        return mspID === 'StudentsMSP';
    }

    /**
     * Récupère l'ID de l'utilisateur appelant
     * Format: x509::/CN=User1@school.academic.edu/...
     */
    _getCallerIdentity(ctx) {
        const userID = ctx.clientIdentity.getID();
        // Extraire le CN (Common Name) de l'identité X.509
        const match = userID.match(/CN=([^,/]+)/);
        return match ? match[1] : userID;
    }

    /**
     * Vérifie si l'appelant a accès à une classe
     * - Teachers (SchoolMSP) : accès à tout
     * - Students (StudentsMSP) : doivent être inscrits
     *
     * @param {Context} ctx - Le contexte de transaction
     * @param {string} classId - ID de la classe
     * @returns {Promise<boolean>}
     * @throws {Error} Si l'utilisateur n'est pas inscrit
     */
    async _checkEnrollment(ctx, classId) {
        const caller = this._getCallerIdentity(ctx);
        const mspID = ctx.clientIdentity.getMSPID();

        console.info(`Checking enrollment for ${caller} (${mspID}) in class ${classId}`);

        // Teachers ont accès à tout
        if (this._isSchoolMember(ctx)) {
            console.info(`✅ Access granted: ${caller} is a teacher (SchoolMSP)`);
            return true;
        }

        // Pour les étudiants, vérifier l'enrollment
        if (this._isStudentMember(ctx)) {
            // Récupérer la classe
            const classAsBytes = await ctx.stub.getState(classId);

            if (!classAsBytes || classAsBytes.length === 0) {
                throw new Error(`Class ${classId} does not exist`);
            }

            const classData = JSON.parse(classAsBytes.toString());

            // Vérifier que c'est bien une classe
            if (classData.docType !== 'class') {
                throw new Error(`${classId} is not a valid class`);
            }

            // Vérifier si l'étudiant est inscrit
            if (!classData.enrolledStudents.includes(caller)) {
                throw new Error(`Access denied: You must be enrolled in class ${classId} to access exams`);
            }

            console.info(`✅ Access granted: ${caller} is enrolled in class ${classId}`);
            return true;
        }

        // Si ni teacher ni student
        throw new Error('Access denied: You must be a member of SchoolOrg or StudentsOrg');
    }

    // ==================== FONCTIONS MÉTIER ====================

    /**
     * 1. Créer un examen
     *
     * Accessible par: SchoolOrg uniquement (teachers)
     *
     * @param {Context} ctx - Le contexte de transaction
     * @param {string} examId - ID unique de l'examen (ex: "exam-cyber-final")
     * @param {string} classId - ID de la classe
     * @param {string} moduleId - ID du module
     * @param {string} title - Titre de l'examen
     * @param {string} examDate - Date de l'examen (ISO 8601: "2024-02-01T10:00:00Z")
     * @param {string} examFileHash - Hash IPFS du fichier d'examen
     * @returns {string} examId
     */
    async CreateExam(ctx, examId, classId, moduleId, title, examDate, examFileHash) {
        console.info('============= START : CreateExam ===========');

        // CONTRÔLE D'ACCÈS: Seulement SchoolOrg peut créer des examens
        if (!this._isSchoolMember(ctx)) {
            throw new Error('Access Denied: Only SchoolOrg members (teachers) can create exams');
        }

        // Vérifier que la classe existe
        const classAsBytes = await ctx.stub.getState(classId);
        if (!classAsBytes || classAsBytes.length === 0) {
            throw new Error(`Class ${classId} does not exist`);
        }

        const classData = JSON.parse(classAsBytes.toString());
        if (classData.docType !== 'class') {
            throw new Error(`${classId} is not a valid class`);
        }

        // Vérifier que l'examen n'existe pas déjà
        const exists = await ctx.stub.getState(examId);
        if (exists && exists.length > 0) {
            throw new Error(`Exam ${examId} already exists`);
        }

        // Valider le format de la date
        const examDateTime = new Date(examDate);
        if (isNaN(examDateTime.getTime())) {
            throw new Error('Invalid examDate format. Use ISO 8601 format (e.g., "2024-02-01T10:00:00Z")');
        }

        // Récupérer l'identité du créateur
        const createdBy = this._getCallerIdentity(ctx);

        // Créer l'objet examen
        const exam = {
            docType: 'exam',
            id: examId,
            classId: classId,
            moduleId: moduleId,
            title: title,
            examDate: examDate,
            examFileHash: examFileHash,
            correctionFileHash: null, // Sera uploadé plus tard
            correctionUploadedAt: null,
            createdBy: createdBy,
            createdAt: new Date().toISOString(),
        };

        // Stocker dans le ledger
        await ctx.stub.putState(examId, Buffer.from(JSON.stringify(exam)));

        // Émettre un événement
        ctx.stub.setEvent('ExamCreated', Buffer.from(JSON.stringify({
            examId: examId,
            classId: classId,
            title: title,
            examDate: examDate,
            createdBy: createdBy,
        })));

        console.info(`✅ Exam created: ${examId} by ${createdBy} for class ${classId}`);
        console.info('============= END : CreateExam ===========');

        return examId;
    }

    /**
     * 2. Upload la correction d'un examen
     *
     * Accessible par: SchoolOrg uniquement (teachers)
     * Contrainte: Ne peut être fait qu'APRÈS examDate
     *
     * @param {Context} ctx - Le contexte de transaction
     * @param {string} examId - ID de l'examen
     * @param {string} correctionFileHash - Hash IPFS du fichier de correction
     * @returns {string} Message de confirmation
     */
    async UploadCorrection(ctx, examId, correctionFileHash) {
        console.info('============= START : UploadCorrection ===========');

        // CONTRÔLE D'ACCÈS: Seulement SchoolOrg peut uploader des corrections
        if (!this._isSchoolMember(ctx)) {
            throw new Error('Access Denied: Only SchoolOrg members (teachers) can upload corrections');
        }

        // Récupérer l'examen
        const examAsBytes = await ctx.stub.getState(examId);
        if (!examAsBytes || examAsBytes.length === 0) {
            throw new Error(`Exam ${examId} does not exist`);
        }

        const exam = JSON.parse(examAsBytes.toString());

        // Vérifier que c'est bien un examen
        if (exam.docType !== 'exam') {
            throw new Error(`${examId} is not an exam`);
        }

        // RÈGLE TEMPORELLE: Ne peut uploader qu'APRÈS examDate
        const now = new Date();
        const examDate = new Date(exam.examDate);

        if (now < examDate) {
            const hoursUntilExam = Math.ceil((examDate - now) / (1000 * 60 * 60));
            throw new Error(`Cannot upload correction before exam date. Exam is in ${hoursUntilExam} hours`);
        }

        // Mettre à jour la correction
        exam.correctionFileHash = correctionFileHash;
        exam.correctionUploadedAt = new Date().toISOString();

        // Sauvegarder
        await ctx.stub.putState(examId, Buffer.from(JSON.stringify(exam)));

        const uploadedBy = this._getCallerIdentity(ctx);

        // Émettre un événement
        ctx.stub.setEvent('CorrectionUploaded', Buffer.from(JSON.stringify({
            examId: examId,
            uploadedBy: uploadedBy,
            uploadedAt: exam.correctionUploadedAt,
        })));

        console.info(`✅ Correction uploaded for exam: ${examId} by ${uploadedBy}`);
        console.info('============= END : UploadCorrection ===========');

        return JSON.stringify({
            success: true,
            message: `Correction successfully uploaded for exam ${examId}`,
            examId: examId,
            uploadedBy: uploadedBy,
        });
    }

    /**
     * 3. Obtenir tous les examens d'une classe
     *
     * Calcule si la correction est disponible (24h après examDate + fichier uploadé)
     * Masque correctionFileHash si non disponible
     *
     * Accessible par: Étudiants inscrits + Teachers
     *
     * @param {Context} ctx - Le contexte de transaction
     * @param {string} classId - ID de la classe
     * @returns {string} JSON array des examens
     */
    async GetExams(ctx, classId) {
        console.info('============= START : GetExams ===========');

        // CONTRÔLE D'ACCÈS: Vérifier l'enrollment
        await this._checkEnrollment(ctx, classId);

        const allResults = [];
        const now = new Date();
        const isTeacher = this._isSchoolMember(ctx);

        // Récupérer tous les états du ledger
        const iterator = await ctx.stub.getStateByRange('', '');
        let result = await iterator.next();

        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;

            try {
                record = JSON.parse(strValue);

                // Filtrer les examens de cette classe uniquement
                if (record.docType === 'exam' && record.classId === classId) {
                    const examDate = new Date(record.examDate);
                    const correctionAvailableAt = new Date(examDate.getTime() + 48 * 60 * 60 * 1000); // +48h

                    // Calculer si la correction est disponible
                    const correctionAvailable = now >= correctionAvailableAt && record.correctionFileHash !== null;

                    const examData = {
                        id: record.id,
                        classId: record.classId,
                        moduleId: record.moduleId,
                        title: record.title,
                        examDate: record.examDate,
                        createdBy: record.createdBy,
                        createdAt: record.createdAt,
                    };

                    // Si teacher : tout voir
                    if (isTeacher) {
                        examData.correctionFileHash = record.correctionFileHash;
                        examData.correctionUploadedAt = record.correctionUploadedAt;
                        examData.correctionAvailable = correctionAvailable;
                    } else {
                        // Si étudiant : masquer selon règle des 24h
                        if (correctionAvailable) {
                            examData.correctionAvailable = true;
                            examData.correctionUploadedAt = record.correctionUploadedAt;
                        } else {
                            examData.correctionAvailable = false;
                            examData.correctionAvailableAt = correctionAvailableAt.toISOString();

                            // Calculer le temps restant
                            if (now < correctionAvailableAt) {
                                const hoursRemaining = Math.ceil((correctionAvailableAt - now) / (1000 * 60 * 60));
                                examData.correctionAvailableIn = `${hoursRemaining} hours`;
                            }
                        }
                        // Ne jamais exposer correctionFileHash aux étudiants ici
                    }

                    allResults.push(examData);
                }
            } catch (err) {
                console.log('Error parsing record:', err);
            }

            result = await iterator.next();
        }

        await iterator.close();

        const caller = this._getCallerIdentity(ctx);
        console.info(`✅ Retrieved ${allResults.length} exams for class ${classId} by ${caller}`);
        console.info('============= END : GetExams ===========');

        return JSON.stringify(allResults);
    }

    /**
     * 4. Obtenir le hash IPFS d'un examen pour téléchargement
     *
     * Vérifie l'enrollment avant de retourner le hash
     *
     * Accessible par: Étudiants inscrits + Teachers
     *
     * @param {Context} ctx - Le contexte de transaction
     * @param {string} examId - ID de l'examen
     * @returns {string} JSON contenant l'examFileHash
     */
    async GetExamFile(ctx, examId) {
        console.info('============= START : GetExamFile ===========');

        // Récupérer l'examen
        const examAsBytes = await ctx.stub.getState(examId);
        if (!examAsBytes || examAsBytes.length === 0) {
            throw new Error(`Exam ${examId} does not exist`);
        }

        const exam = JSON.parse(examAsBytes.toString());

        // Vérifier que c'est bien un examen
        if (exam.docType !== 'exam') {
            throw new Error(`${examId} is not an exam`);
        }

        // CONTRÔLE D'ACCÈS: Vérifier l'enrollment dans la classe de l'examen
        await this._checkEnrollment(ctx, exam.classId);

        const caller = this._getCallerIdentity(ctx);
        console.info(`✅ Exam file accessed: ${examId} by ${caller}`);
        console.info('============= END : GetExamFile ===========');

        // Retourner le hash IPFS et les métadonnées
        return JSON.stringify({
            id: exam.id,
            title: exam.title,
            examDate: exam.examDate,
            examFileHash: exam.examFileHash,
            classId: exam.classId,
            moduleId: exam.moduleId,
        });
    }

    /**
     * 5. Obtenir le hash IPFS de la correction pour téléchargement
     *
     * RÈGLE DES 24H: Vérifie que (now - examDate) >= 24h
     * Vérifie l'enrollment
     *
     * Accessible par: Étudiants inscrits + Teachers (Teachers : pas de limite temporelle)
     *
     * @param {Context} ctx - Le contexte de transaction
     * @param {string} examId - ID de l'examen
     * @returns {string} JSON contenant le correctionFileHash
     */
    async GetCorrectionFile(ctx, examId) {
        console.info('============= START : GetCorrectionFile ===========');

        // Récupérer l'examen
        const examAsBytes = await ctx.stub.getState(examId);
        if (!examAsBytes || examAsBytes.length === 0) {
            throw new Error(`Exam ${examId} does not exist`);
        }

        const exam = JSON.parse(examAsBytes.toString());

        // Vérifier que c'est bien un examen
        if (exam.docType !== 'exam') {
            throw new Error(`${examId} is not an exam`);
        }

        // CONTRÔLE D'ACCÈS: Vérifier l'enrollment dans la classe de l'examen
        await this._checkEnrollment(ctx, exam.classId);

        // Vérifier que la correction existe
        if (!exam.correctionFileHash) {
            throw new Error(`Correction not yet uploaded for exam ${examId}`);
        }

        const isTeacher = this._isSchoolMember(ctx);
        const now = new Date();
        const examDate = new Date(exam.examDate);
        const correctionAvailableAt = new Date(examDate.getTime() + 48 * 60 * 60 * 1000); // +48h

        // RÈGLE DES 24H: Seulement pour les étudiants
        if (!isTeacher && now < correctionAvailableAt) {
            const hoursRemaining = Math.ceil((correctionAvailableAt - now) / (1000 * 60 * 60));
            throw new Error(`Correction available in ${hoursRemaining} hours (24h after exam date)`);
        }

        const caller = this._getCallerIdentity(ctx);
        console.info(`✅ Correction file accessed: ${examId} by ${caller}`);
        console.info('============= END : GetCorrectionFile ===========');

        // Retourner le hash IPFS de la correction
        return JSON.stringify({
            id: exam.id,
            title: exam.title,
            examDate: exam.examDate,
            correctionFileHash: exam.correctionFileHash,
            correctionUploadedAt: exam.correctionUploadedAt,
            classId: exam.classId,
            moduleId: exam.moduleId,
        });
    }

    // ==================== FONCTIONS UTILITAIRES BONUS ====================

    /**
     * Obtenir les détails complets d'un examen
     * Accessible par: Teachers uniquement
     */
    async GetExam(ctx, examId) {
        console.info('============= START : GetExam ===========');

        if (!this._isSchoolMember(ctx)) {
            throw new Error('Access Denied: Only teachers can view full exam details');
        }

        const examAsBytes = await ctx.stub.getState(examId);
        if (!examAsBytes || examAsBytes.length === 0) {
            throw new Error(`Exam ${examId} does not exist`);
        }

        const exam = JSON.parse(examAsBytes.toString());

        if (exam.docType !== 'exam') {
            throw new Error(`${examId} is not an exam`);
        }

        console.info(`✅ Exam retrieved: ${examId}`);
        console.info('============= END : GetExam ===========');

        return JSON.stringify(exam);
    }

    /**
     * Supprimer un examen
     * Accessible par: Teachers uniquement
     */
    async DeleteExam(ctx, examId) {
        console.info('============= START : DeleteExam ===========');

        if (!this._isSchoolMember(ctx)) {
            throw new Error('Access Denied: Only teachers can delete exams');
        }

        const examAsBytes = await ctx.stub.getState(examId);
        if (!examAsBytes || examAsBytes.length === 0) {
            throw new Error(`Exam ${examId} does not exist`);
        }

        const exam = JSON.parse(examAsBytes.toString());

        if (exam.docType !== 'exam') {
            throw new Error(`${examId} is not an exam`);
        }

        // Supprimer du ledger
        await ctx.stub.deleteState(examId);

        const caller = this._getCallerIdentity(ctx);

        // Émettre un événement
        ctx.stub.setEvent('ExamDeleted', Buffer.from(JSON.stringify({
            examId: examId,
            classId: exam.classId,
            deletedBy: caller,
        })));

        console.info(`✅ Exam deleted: ${examId} by ${caller}`);
        console.info('============= END : DeleteExam ===========');

        return JSON.stringify({
            success: true,
            message: `Exam ${examId} successfully deleted`,
        });
    }

    /**
     * Mettre à jour la date d'un examen
     * Accessible par: Teachers uniquement
     * Contrainte: Seulement si aucune correction n'a été uploadée
     */
    async UpdateExamDate(ctx, examId, newExamDate) {
        console.info('============= START : UpdateExamDate ===========');

        if (!this._isSchoolMember(ctx)) {
            throw new Error('Access Denied: Only teachers can update exam dates');
        }

        const examAsBytes = await ctx.stub.getState(examId);
        if (!examAsBytes || examAsBytes.length === 0) {
            throw new Error(`Exam ${examId} does not exist`);
        }

        const exam = JSON.parse(examAsBytes.toString());

        if (exam.docType !== 'exam') {
            throw new Error(`${examId} is not an exam`);
        }

        // Ne peut pas modifier la date si la correction a été uploadée
        if (exam.correctionFileHash) {
            throw new Error('Cannot update exam date after correction has been uploaded');
        }

        // Valider le nouveau format de date
        const newDate = new Date(newExamDate);
        if (isNaN(newDate.getTime())) {
            throw new Error('Invalid date format. Use ISO 8601 format (e.g., "2024-02-01T10:00:00Z")');
        }

        const oldDate = exam.examDate;
        exam.examDate = newExamDate;

        await ctx.stub.putState(examId, Buffer.from(JSON.stringify(exam)));

        const caller = this._getCallerIdentity(ctx);

        ctx.stub.setEvent('ExamDateUpdated', Buffer.from(JSON.stringify({
            examId: examId,
            oldDate: oldDate,
            newDate: newExamDate,
            updatedBy: caller,
        })));

        console.info(`✅ Exam date updated: ${examId} by ${caller}`);
        console.info('============= END : UpdateExamDate ===========');

        return JSON.stringify({
            success: true,
            message: `Exam date updated from ${oldDate} to ${newExamDate}`,
        });
    }
}

module.exports = ExamContract;
