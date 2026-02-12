/*
 * Class Management Smart Contract
 *
 * Contrôle d'accès:
 * - SchoolMSP: SchoolOrg (établissement, teachers, admin)
 * - StudentsMSP: StudentsOrg (étudiants)
 */

'use strict';

const { Contract } = require('fabric-contract-api');

class ClassContract extends Contract {

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
     * Vérifie si l'appelant est authentifié (membre de n'importe quelle org)
     */
    _isAuthenticated(ctx) {
        const mspID = ctx.clientIdentity.getMSPID();
        return mspID === 'SchoolMSP' || mspID === 'StudentsMSP';
    }

    /**
     * Get deterministic timestamp from transaction (same across all peers)
     */
    _getTxTimestamp(ctx) {
        const timestamp = ctx.stub.getTxTimestamp();
        const seconds = timestamp.seconds.low || timestamp.seconds;
        return new Date(seconds * 1000).toISOString();
    }

    // ==================== FONCTIONS MÉTIER ====================

    /**
     * 1. Créer une classe
     *
     * Accessible par: SchoolOrg uniquement (teachers)
     *
     * @param {Context} ctx - Le contexte de transaction
     * @param {string} classId - Identifiant unique de la classe (ex: "CYBER101")
     * @param {string} name - Nom de la classe (ex: "Cybersécurité")
     * @param {string} description - Description du cours
     * @returns {string} classId
     */
    async CreateClass(ctx, classId, name, description) {
        console.info('============= START : CreateClass ===========');

        // CONTRÔLE D'ACCÈS: Seulement SchoolOrg peut créer des classes
        if (!this._isSchoolMember(ctx)) {
            throw new Error('Access Denied: Only SchoolOrg members (teachers) can create classes');
        }

        // Vérifier si la classe existe déjà
        const exists = await this._classExists(ctx, classId);
        if (exists) {
            throw new Error(`Class ${classId} already exists`);
        }

        // Récupérer l'identité du créateur
        const createdBy = this._getCallerIdentity(ctx);

        // Use deterministic transaction timestamp (same across all peers)
        const txTimestamp = this._getTxTimestamp(ctx);

        // Créer l'objet classe
        const classData = {
            docType: 'class',
            id: classId,
            name: name,
            description: description,
            modules: [], // Liste des modules du cours
            enrolledStudents: [], // Liste des étudiants inscrits
            createdBy: createdBy,
            createdAt: txTimestamp,
            updatedAt: txTimestamp,
        };

        // Stocker dans le ledger
        await ctx.stub.putState(classId, Buffer.from(JSON.stringify(classData)));

        // Émettre un événement
        ctx.stub.setEvent('ClassCreated', Buffer.from(JSON.stringify({
            classId: classId,
            name: name,
            createdBy: createdBy,
        })));

        console.info(`✅ Class created: ${classId} by ${createdBy}`);
        console.info('============= END : CreateClass ===========');

        return classId;
    }

    /**
     * 2. Obtenir la liste de toutes les classes (informations publiques)
     *
     * Accessible par: TOUS (public) - Pas de contrôle d'accès
     * Règle métier: "Description et organisation accessibles à tous"
     *
     * Retourne uniquement: id, name, description (sans modules ni enrolledStudents)
     *
     * @param {Context} ctx - Le contexte de transaction
     * @returns {string} JSON array des classes (format public)
     */
    async GetAllClasses(ctx) {
        console.info('============= START : GetAllClasses (PUBLIC) ===========');

        // PAS DE CONTRÔLE D'ACCÈS - Accessible à tous

        const allResults = [];

        // Récupérer tous les états du ledger
        const iterator = await ctx.stub.getStateByRange('', '');
        let result = await iterator.next();

        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
            let record;

            try {
                record = JSON.parse(strValue);

                // Filtrer uniquement les classes
                if (record.docType === 'class') {
                    // Retourner UNIQUEMENT les informations publiques
                    allResults.push({
                        id: record.id,
                        name: record.name,
                        description: record.description,
                        // modules et enrolledStudents sont EXCLUS (informations privées)
                    });
                }
            } catch (err) {
                console.log('Error parsing record:', err);
            }

            result = await iterator.next();
        }

        await iterator.close();

        console.info(`✅ Retrieved ${allResults.length} classes (public view)`);
        console.info('============= END : GetAllClasses ===========');

        return JSON.stringify(allResults);
    }

    /**
     * 3. Obtenir les détails complets d'une classe
     *
     * Accessible par: Tous les participants authentifiés (SchoolOrg + StudentsOrg)
     *
     * Retourne: Classe complète avec modules et liste des étudiants inscrits
     *
     * @param {Context} ctx - Le contexte de transaction
     * @param {string} classId - Identifiant de la classe
     * @returns {string} JSON de la classe complète
     */
    async GetClassDetails(ctx, classId) {
        console.info('============= START : GetClassDetails ===========');

        // CONTRÔLE D'ACCÈS: Doit être authentifié (SchoolOrg ou StudentsOrg)
        if (!this._isAuthenticated(ctx)) {
            throw new Error('Access Denied: You must be authenticated to view class details');
        }

        const caller = this._getCallerIdentity(ctx);
        const mspID = ctx.clientIdentity.getMSPID();

        // Récupérer la classe
        const classAsBytes = await ctx.stub.getState(classId);
        if (!classAsBytes || classAsBytes.length === 0) {
            throw new Error(`Class ${classId} does not exist`);
        }

        const classData = JSON.parse(classAsBytes.toString());

        // Vérifier que c'est bien une classe
        if (classData.docType !== 'class') {
            throw new Error(`${classId} is not a class`);
        }

        // Log de l'accès pour audit
        console.info(`✅ Class details accessed: ${classId} by ${caller} (${mspID})`);
        console.info('============= END : GetClassDetails ===========');

        // Retourner la classe complète avec tous les détails
        return JSON.stringify({
            id: classData.id,
            name: classData.name,
            description: classData.description,
            modules: classData.modules,
            enrolledStudents: classData.enrolledStudents,
            createdBy: classData.createdBy,
            createdAt: classData.createdAt,
            updatedAt: classData.updatedAt,
        });
    }

    /**
     * 4. Inscrire un étudiant à une classe
     *
     * Accessible par:
     * - SchoolOrg (teachers/admin) - Peut inscrire n'importe quel étudiant
     * - L'étudiant lui-même - Peut uniquement s'inscrire lui-même
     *
     * @param {Context} ctx - Le contexte de transaction
     * @param {string} classId - Identifiant de la classe
     * @param {string} studentId - Identifiant de l'étudiant (ex: "student1@students.academic.edu")
     * @returns {string} Message de confirmation
     */
    async EnrollStudent(ctx, classId, studentId) {
        console.info('============= START : EnrollStudent ===========');

        const caller = this._getCallerIdentity(ctx);
        const mspID = ctx.clientIdentity.getMSPID();

        // CONTRÔLE D'ACCÈS COMPLEXE:
        // 1. Si SchoolOrg: Peut inscrire n'importe qui
        // 2. Si StudentsOrg: Peut uniquement s'inscrire lui-même

        const isSchool = this._isSchoolMember(ctx);
        const isStudent = this._isStudentMember(ctx);

        if (!isSchool && !isStudent) {
            throw new Error('Access Denied: You must be a member of SchoolOrg or StudentsOrg');
        }

        // Si c'est un étudiant, il ne peut inscrire que lui-même
        if (isStudent && caller !== studentId) {
            throw new Error(`Access Denied: Students can only enroll themselves. You are ${caller}, trying to enroll ${studentId}`);
        }

        // Vérifier que la classe existe
        const classAsBytes = await ctx.stub.getState(classId);
        if (!classAsBytes || classAsBytes.length === 0) {
            throw new Error(`Class ${classId} does not exist`);
        }

        const classData = JSON.parse(classAsBytes.toString());

        if (classData.docType !== 'class') {
            throw new Error(`${classId} is not a class`);
        }

        // Vérifier si l'étudiant est déjà inscrit
        if (classData.enrolledStudents.includes(studentId)) {
            throw new Error(`Student ${studentId} is already enrolled in class ${classId}`);
        }

        // Ajouter l'étudiant à la liste des inscrits
        classData.enrolledStudents.push(studentId);
        classData.updatedAt = this._getTxTimestamp(ctx);

        // Sauvegarder la classe mise à jour
        await ctx.stub.putState(classId, Buffer.from(JSON.stringify(classData)));

        // Émettre un événement
        ctx.stub.setEvent('StudentEnrolled', Buffer.from(JSON.stringify({
            classId: classId,
            studentId: studentId,
            enrolledBy: caller,
            mspID: mspID,
        })));

        const message = `Student ${studentId} successfully enrolled in class ${classId}`;
        console.info(`✅ ${message} by ${caller} (${mspID})`);
        console.info('============= END : EnrollStudent ===========');

        return JSON.stringify({
            success: true,
            message: message,
            classId: classId,
            studentId: studentId,
            enrolledBy: caller,
        });
    }

    // ==================== FONCTIONS UTILITAIRES ====================

    /**
     * Vérifie si une classe existe
     * @private
     */
    async _classExists(ctx, classId) {
        const classAsBytes = await ctx.stub.getState(classId);
        return classAsBytes && classAsBytes.length > 0;
    }

    /**
     * Ajouter des modules à une classe (bonus)
     * Accessible uniquement par SchoolOrg
     */
    async AddModuleToClass(ctx, classId, moduleName) {
        console.info('============= START : AddModuleToClass ===========');

        if (!this._isSchoolMember(ctx)) {
            throw new Error('Access Denied: Only SchoolOrg members can add modules');
        }

        const classAsBytes = await ctx.stub.getState(classId);
        if (!classAsBytes || classAsBytes.length === 0) {
            throw new Error(`Class ${classId} does not exist`);
        }

        const classData = JSON.parse(classAsBytes.toString());

        if (classData.modules.includes(moduleName)) {
            throw new Error(`Module ${moduleName} already exists in class ${classId}`);
        }

        classData.modules.push(moduleName);
        classData.updatedAt = this._getTxTimestamp(ctx);

        await ctx.stub.putState(classId, Buffer.from(JSON.stringify(classData)));

        console.info(`✅ Module ${moduleName} added to class ${classId}`);
        console.info('============= END : AddModuleToClass ===========');

        return JSON.stringify({ success: true, classId: classId, module: moduleName });
    }

    /**
     * Obtenir les étudiants inscrits à une classe
     * Accessible par SchoolOrg uniquement
     */
    async GetEnrolledStudents(ctx, classId) {
        console.info('============= START : GetEnrolledStudents ===========');

        if (!this._isSchoolMember(ctx)) {
            throw new Error('Access Denied: Only SchoolOrg members can view enrolled students');
        }

        const classAsBytes = await ctx.stub.getState(classId);
        if (!classAsBytes || classAsBytes.length === 0) {
            throw new Error(`Class ${classId} does not exist`);
        }

        const classData = JSON.parse(classAsBytes.toString());

        console.info(`✅ Retrieved ${classData.enrolledStudents.length} enrolled students`);
        console.info('============= END : GetEnrolledStudents ===========');

        return JSON.stringify({
            classId: classId,
            className: classData.name,
            enrolledStudents: classData.enrolledStudents,
            count: classData.enrolledStudents.length,
        });
    }
}

module.exports = ClassContract;
