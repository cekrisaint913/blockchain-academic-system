

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { UserPlus, BookOpen } from 'lucide-react';

export default function RegisterPage() {
    const [username, setUsername] = useState('');
    const [role, setRole] = useState('student');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    
    const { register } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const result = await register(username, role);
        
        if (result.success) {
            setSuccess(true);
            setTimeout(() => {
                navigate('/login');
            }, 2000);
        } else {
            setError(result.error);
        }
        setLoading(false);
    };

    if (success) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center p-4">
                <div className="card max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">
                        Inscription réussie !
                    </h2>
                    <p className="text-gray-600">
                        Redirection vers la page de connexion...
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center p-4">
            <div className="max-w-md w-full">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-full mb-4">
                        <BookOpen className="w-8 h-8 text-primary-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">
                        Academic Blockchain
                    </h1>
                    <p className="text-primary-100">
                        Créer un nouveau compte
                    </p>
                </div>

                <div className="card">
                    <h2 className="text-2xl font-bold mb-6 text-gray-800">
                        Inscription
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
                                placeholder="jean_dupont"
                                pattern="^[a-zA-Z0-9_]{3,30}$"
                                title="3-30 caractères : lettres, chiffres et underscore uniquement"
                                required
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                3-30 caractères : lettres, chiffres et _ uniquement
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Rôle
                            </label>
                            <select
                                value={role}
                                onChange={(e) => setRole(e.target.value)}
                                className="input"
                            >
                                <option value="student">Étudiant</option>
                                <option value="teacher">Enseignant</option>
                            </select>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full btn-primary flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Inscription...
                                </>
                            ) : (
                                <>
                                    <UserPlus className="w-5 h-5" />
                                    S'inscrire
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-sm text-gray-600">
                            Déjà un compte ?{' '}
                            <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
                                Se connecter
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
