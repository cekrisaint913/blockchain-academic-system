

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

class AuthService {
    constructor() {
        this.walletPath = path.join(__dirname, '../../wallet');
    }

    // Générer un token JWT
    generateToken(user) {
        const payload = {
            username: user.username,
            role: user.role,
            organization: user.organization || 'Org1'
        };

        return jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN || '24h'
        });
    }

    // Enregistrer un nouvel utilisateur dans le wallet Fabric
    async registerUser(username, role = 'student', organization = 'Org1') {
        try {
            // Charger le wallet
            const wallet = await Wallets.newFileSystemWallet(this.walletPath);

            // Vérifier si l'utilisateur existe déjà
            const userIdentity = await wallet.get(username);
            if (userIdentity) {
                throw new Error(`User ${username} already exists in wallet`);
            }

            // Charger les informations de connexion à la CA
            const ccpPath = path.resolve(
                __dirname,
                '../../',
                process.env.FABRIC_PATH,
                `organizations/peerOrganizations/${organization.toLowerCase()}.example.com/connection-${organization.toLowerCase()}.json`
            );
            const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

            // Créer une nouvelle instance CA
            const caInfo = ccp.certificateAuthorities[`ca.${organization.toLowerCase()}.example.com`];
            const caTLSCACerts = caInfo.tlsCACerts.pem;
            const ca = new FabricCAServices(
                caInfo.url,
                { trustedRoots: caTLSCACerts, verify: false },
                caInfo.caName
            );

            // Récupérer l'identité admin
            const adminIdentity = await wallet.get('admin');
            if (!adminIdentity) {
                throw new Error('Admin identity not found. Please enroll admin first.');
            }

            // Créer le provider et le contexte utilisateur admin
            const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
            const adminUser = await provider.getUserContext(adminIdentity, 'admin');

            // Enregistrer le nouvel utilisateur
            const secret = await ca.register(
                {
                    affiliation: `${organization.toLowerCase()}.department1`,
                    enrollmentID: username,
                    role: 'client',
                    attrs: [
                        { name: 'role', value: role, ecert: true },
                        { name: 'username', value: username, ecert: true }
                    ]
                },
                adminUser
            );

            // Enroller l'utilisateur
            const enrollment = await ca.enroll({
                enrollmentID: username,
                enrollmentSecret: secret,
                attr_reqs: [
                    { name: 'role', optional: false },
                    { name: 'username', optional: false }
                ]
            });

            // Créer l'identité X.509
            const x509Identity = {
                credentials: {
                    certificate: enrollment.certificate,
                    privateKey: enrollment.key.toBytes(),
                },
                mspId: `${organization}MSP`,
                type: 'X.509',
            };

            // Ajouter au wallet
            await wallet.put(username, x509Identity);

            logger.info(`User ${username} registered successfully with role ${role}`);

            return {
                username,
                role,
                organization
            };
        } catch (error) {
            logger.error(`Failed to register user ${username}: ${error.message}`);
            throw error;
        }
    }

    // Authentifier un utilisateur
    async login(username, password) {
        try {
            const wallet = await Wallets.newFileSystemWallet(this.walletPath);
            
            // Vérifier si l'utilisateur existe dans le wallet
            const identity = await wallet.get(username);
            if (!identity) {
                throw new Error('Invalid credentials');
            }

            // Pour la démo, on simule la vérification du mot de passe
            // En production, stocker les hash des mots de passe dans une BD
            const isValidPassword = await this.verifyPassword(username, password);
            if (!isValidPassword) {
                throw new Error('Invalid credentials');
            }

            // Récupérer le rôle de l'utilisateur (depuis les attributs du certificat)
            const role = this.extractRoleFromIdentity(identity);

            const user = {
                username,
                role,
                organization: identity.mspId.replace('MSP', '')
            };

            const token = this.generateToken(user);

            logger.info(`User ${username} logged in successfully`);

            return {
                token,
                user: {
                    username: user.username,
                    role: user.role,
                    organization: user.organization
                }
            };
        } catch (error) {
            logger.error(`Login failed for ${username}: ${error.message}`);
            throw error;
        }
    }

    // Extraire le rôle du certificat (simplifié pour la démo)
    extractRoleFromIdentity(identity) {
        // Dans une vraie implémentation, parser le certificat X.509
        // Pour la démo, on retourne un rôle par défaut
        if (identity.mspId.includes('Org1')) {
            return 'student';
        }
        return 'teacher';
    }

    // Vérifier le mot de passe (simplifié pour la démo)
    async verifyPassword(username, password) {
        // En production, récupérer le hash depuis une base de données
        // Pour la démo, on accepte tous les mots de passe
        // ATTENTION: NE JAMAIS FAIRE ÇA EN PRODUCTION!
        
        // Exemple de vérification réelle :
        // const userRecord = await db.getUser(username);
        // return await bcrypt.compare(password, userRecord.passwordHash);
        
        return true; // DEMO ONLY
    }
}

module.exports = new AuthService();
