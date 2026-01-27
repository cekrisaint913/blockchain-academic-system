

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogIn, BookOpen } from 'lucide-react';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    
    const { login, isAuthenticated } = useAuth();
    const navigate = useNavigate();

    // Rediriger si déjà connecté
    if (isAuthenticated) {
        navigate('/dashboard');
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const result = await login(username, password);
        
        if (result.success) {
            navigate('/dashboard');
        } else {
            setError(result.error);
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center p-4">
            <div className="max-w-md w-full">
                {/* Logo et titre */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-full mb-4">
                        <BookOpen className="w-8 h-8 text-primary-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">
                        Academic Blockchain
                    </h1>
                    <p className="text-primary-100">
                        Système de gestion académique décentralisé
                    </p>
                </div>

                {/* Formulaire */}
                <div className="card">
                    <h2 className="text-2xl font-bold mb-6 text-gray-800">
                        Connexion
                    </h2>

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Nom d'utilisateur
                            </label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="input"
                                placeholder="prof_dupont ou alice_martin"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Mot de passe
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="input"
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full btn-primary flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Connexion...
                                </>
                            ) : (
                                <>
                                    <LogIn className="w-5 h-5" />
                                    Se connecter
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-sm text-gray-600">
                            Pas encore de compte ?{' '}
                            <Link to="/register" className="text-primary-600 hover:text-primary-700 font-medium">
                                S'inscrire
                            </Link>
                        </p>
                    </div>

                    {/* Info pour démo */}
                    <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                        <p className="text-xs text-blue-800 font-medium mb-2">
                            💡 Comptes de démonstration :
                        </p>
                        <div className="text-xs text-blue-700 space-y-1">
                            <p>• Enseignant : prof_dupont / password</p>
                            <p>• Étudiant : alice_martin / password</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
