/**
 * IPFS Service - Gestion des fichiers volumineux off-chain
 *
 * Les fichiers (PDF cours, examens, corrections) sont stockés sur IPFS.
 * Seul le hash IPFS est enregistré on-chain pour garantir l'intégrité.
 */

const { create } = require('ipfs-http-client');

class IPFSService {
    constructor() {
        this.ipfs = null;
        this.isConnected = false;
    }

    /**
     * Initialise la connexion au nœud IPFS
     * Supporte: nœud local, Infura, ou autre gateway
     */
    async connect() {
        if (this.isConnected && this.ipfs) {
            return this.ipfs;
        }

        try {
            // Configuration depuis les variables d'environnement
            const host = process.env.IPFS_HOST || 'localhost';
            const port = process.env.IPFS_PORT || 5001;
            const protocol = process.env.IPFS_PROTOCOL || 'http';

            // Support pour Infura (nécessite authentification)
            const infuraProjectId = process.env.INFURA_IPFS_PROJECT_ID;
            const infuraProjectSecret = process.env.INFURA_IPFS_PROJECT_SECRET;

            if (infuraProjectId && infuraProjectSecret) {
                // Connexion Infura IPFS
                const auth = 'Basic ' + Buffer.from(infuraProjectId + ':' + infuraProjectSecret).toString('base64');
                this.ipfs = create({
                    host: 'ipfs.infura.io',
                    port: 5001,
                    protocol: 'https',
                    headers: {
                        authorization: auth
                    }
                });
                console.log('IPFS: Connected to Infura');
            } else {
                // Connexion nœud local
                this.ipfs = create({
                    host,
                    port,
                    protocol
                });
                console.log(`IPFS: Connected to ${protocol}://${host}:${port}`);
            }

            // Test de connexion
            await this.ipfs.id();
            this.isConnected = true;

            return this.ipfs;
        } catch (error) {
            this.isConnected = false;
            console.error('IPFS connection failed:', error.message);
            throw new Error(`IPFS connection failed: ${error.message}`);
        }
    }

    /**
     * Upload un fichier sur IPFS
     * @param {Buffer} fileBuffer - Contenu du fichier
     * @param {string} fileName - Nom original du fichier
     * @param {Object} options - Options supplémentaires
     * @returns {Object} - { cid, size, path }
     */
    async uploadFile(fileBuffer, fileName, options = {}) {
        await this.connect();

        try {
            const result = await this.ipfs.add({
                path: fileName,
                content: fileBuffer
            }, {
                pin: options.pin !== false, // Pin par défaut
                cidVersion: 1,              // Utiliser CIDv1
                ...options
            });

            console.log(`IPFS: File uploaded - CID: ${result.cid.toString()}, Size: ${result.size} bytes`);

            return {
                cid: result.cid.toString(),
                size: result.size,
                path: result.path
            };
        } catch (error) {
            console.error('IPFS upload failed:', error.message);
            throw new Error(`IPFS upload failed: ${error.message}`);
        }
    }

    /**
     * Télécharge un fichier depuis IPFS
     * @param {string} ipfsHash - CID/Hash IPFS
     * @returns {Buffer} - Contenu du fichier
     */
    async downloadFile(ipfsHash) {
        await this.connect();

        try {
            const chunks = [];

            for await (const chunk of this.ipfs.cat(ipfsHash)) {
                chunks.push(chunk);
            }

            const buffer = Buffer.concat(chunks);
            console.log(`IPFS: File downloaded - CID: ${ipfsHash}, Size: ${buffer.length} bytes`);

            return buffer;
        } catch (error) {
            console.error('IPFS download failed:', error.message);
            throw new Error(`IPFS download failed: ${error.message}`);
        }
    }

    /**
     * Vérifie si un fichier existe sur IPFS
     * @param {string} ipfsHash - CID/Hash IPFS
     * @returns {boolean}
     */
    async fileExists(ipfsHash) {
        await this.connect();

        try {
            const stat = await this.ipfs.files.stat(`/ipfs/${ipfsHash}`);
            return stat && stat.cid;
        } catch (error) {
            // Fallback: essayer de récupérer les premiers octets
            try {
                for await (const chunk of this.ipfs.cat(ipfsHash, { length: 1 })) {
                    return true;
                }
            } catch {
                return false;
            }
        }
        return false;
    }

    /**
     * Pin un fichier pour le garder disponible
     * @param {string} ipfsHash - CID/Hash IPFS
     */
    async pinFile(ipfsHash) {
        await this.connect();

        try {
            await this.ipfs.pin.add(ipfsHash);
            console.log(`IPFS: File pinned - CID: ${ipfsHash}`);
            return true;
        } catch (error) {
            console.error('IPFS pin failed:', error.message);
            throw new Error(`IPFS pin failed: ${error.message}`);
        }
    }

    /**
     * Unpin un fichier (permet sa suppression par le garbage collector)
     * @param {string} ipfsHash - CID/Hash IPFS
     */
    async unpinFile(ipfsHash) {
        await this.connect();

        try {
            await this.ipfs.pin.rm(ipfsHash);
            console.log(`IPFS: File unpinned - CID: ${ipfsHash}`);
            return true;
        } catch (error) {
            console.error('IPFS unpin failed:', error.message);
            throw new Error(`IPFS unpin failed: ${error.message}`);
        }
    }

    /**
     * Récupère les métadonnées d'un fichier
     * @param {string} ipfsHash - CID/Hash IPFS
     * @returns {Object} - { cid, size, type }
     */
    async getFileInfo(ipfsHash) {
        await this.connect();

        try {
            const stat = await this.ipfs.object.stat(ipfsHash);
            return {
                cid: ipfsHash,
                size: stat.CumulativeSize,
                numLinks: stat.NumLinks,
                blockSize: stat.BlockSize
            };
        } catch (error) {
            console.error('IPFS stat failed:', error.message);
            throw new Error(`IPFS stat failed: ${error.message}`);
        }
    }

    /**
     * Stream un fichier (pour les gros fichiers)
     * @param {string} ipfsHash - CID/Hash IPFS
     * @returns {AsyncGenerator} - Stream de chunks
     */
    async *streamFile(ipfsHash) {
        await this.connect();

        try {
            for await (const chunk of this.ipfs.cat(ipfsHash)) {
                yield chunk;
            }
        } catch (error) {
            console.error('IPFS stream failed:', error.message);
            throw new Error(`IPFS stream failed: ${error.message}`);
        }
    }

    /**
     * Vérifie l'état de la connexion IPFS
     * @returns {Object} - Informations sur le nœud
     */
    async getStatus() {
        try {
            await this.connect();
            const id = await this.ipfs.id();
            return {
                connected: true,
                peerId: id.id,
                addresses: id.addresses,
                agentVersion: id.agentVersion
            };
        } catch (error) {
            return {
                connected: false,
                error: error.message
            };
        }
    }
}

// Singleton
module.exports = new IPFSService();
