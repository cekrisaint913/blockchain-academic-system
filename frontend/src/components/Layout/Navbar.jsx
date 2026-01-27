

import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { BookOpen, LogOut, User, Home, GraduationCap } from 'lucide-react';

export default function Navbar() {
    const { user, logout, isTeacher } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <nav className="bg-white shadow-sm border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                    <div className="flex items-center">
                        <Link to="/dashboard" className="flex items-center gap-2">
                            <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
                                <BookOpen className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-xl font-bold text-gray-900">
                                Academic Blockchain
                            </span>
                        </Link>

                        <div className="hidden md:flex ml-10 space-x-4">
                            <Link
                                to="/dashboard"
                                className="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                            >
                                <Home className="w-4 h-4" />
                                Tableau de bord
                            </Link>
                            <Link
                                to="/classes"
                                className="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                            >
                                <GraduationCap className="w-4 h-4" />
                                Classes
                            </Link>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3">
                            <div className="text-right">
                                <p className="text-sm font-medium text-gray-900">
                                    {user?.username}
                                </p>
                                <p className="text-xs text-gray-500 capitalize">
                                    {user?.role === 'teacher' ? 'Enseignant' : 'Étudiant'}
                                </p>
                            </div>
                            <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                                <User className="w-5 h-5 text-primary-600" />
                            </div>
                        </div>

                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <LogOut className="w-4 h-4" />
                            <span className="hidden md:inline">Déconnexion</span>
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    );
}
