

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { classesAPI } from '../services/api';
import MainLayout from '../components/Layout/MainLayout';
import { Plus, Search, Users, Calendar, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ClassesPage() {
    const { isTeacher, user } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const queryClient = useQueryClient();

    const { data: classesData, isLoading } = useQuery({
        queryKey: ['classes'],
        queryFn: async () => {
            const response = await classesAPI.getAll();
            return response.data.data;
        },
    });

    const filteredClasses = classesData?.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.classId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.teacher.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <MainLayout>
            <div className="space-y-6">
                {/* En-tête */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Classes</h1>
                        <p className="mt-1 text-gray-600">
                            {isTeacher 
                                ? 'Gérez vos classes et créez-en de nouvelles'
                                : 'Parcourez et inscrivez-vous aux classes disponibles'}
                        </p>
                    </div>
                    {isTeacher && (
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="btn-primary flex items-center gap-2"
                        >
                            <Plus className="w-5 h-5" />
                            Créer une classe
                        </button>
                    )}
                </div>

                {/* Barre de recherche */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Rechercher une classe..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="input pl-10"
                    />
                </div>

                {/* Liste des classes */}
                {isLoading ? (
                    <div className="text-center py-12">
                        <div className="inline-block w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredClasses?.map((classItem) => (
                            <Link
                                key={classItem.classId}
                                to={`/classes/${classItem.classId}`}
                                className="card hover:shadow-lg transition-shadow cursor-pointer"
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                                            <BookOpen className="w-5 h-5 text-primary-600" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-gray-900">
                                                {classItem.name}
                                            </h3>
                                            <span className="text-xs text-gray-500">
                                                {classItem.classId}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                                    {classItem.description}
                                </p>

                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                        <Users className="w-4 h-4" />
                                        <span>{classItem.teacher}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                        <Calendar className="w-4 h-4" />
                                        <span>{classItem.semester}</span>
                                    </div>
                                </div>

                                <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between">
                                    <span className="text-xs text-gray-500">
                                        Max: {classItem.maxStudents} étudiants
                                    </span>
                                    <span className="badge badge-blue">
                                        Disponible
                                    </span>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}

                {filteredClasses?.length === 0 && !isLoading && (
                    <div className="text-center py-12">
                        <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                            Aucune classe trouvée
                        </h3>
                        <p className="text-gray-600">
                            {searchTerm
                                ? 'Essayez avec un autre terme de recherche'
                                : 'Les classes apparaîtront ici une fois créées'}
                        </p>
                    </div>
                )}
            </div>

            {/* Modal de création (simplifié pour l'instant) */}
            {showCreateModal && (
                <CreateClassModal
                    onClose={() => setShowCreateModal(false)}
                    onSuccess={() => {
                        queryClient.invalidateQueries(['classes']);
                        setShowCreateModal(false);
                    }}
                />
            )}
        </MainLayout>
    );
}

// Composant Modal de création
function CreateClassModal({ onClose, onSuccess }) {
    const [formData, setFormData] = useState({
        classId: '',
        name: '',
        description: '',
        teacher: '',
        semester: '',
        maxStudents: 30,
    });
    const [error, setError] = useState('');

    const createMutation = useMutation({
        mutationFn: (data) => classesAPI.create(data),
        onSuccess: () => {
            onSuccess();
        },
        onError: (error) => {
            setError(error.response?.data?.error || 'Erreur lors de la création');
        },
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        createMutation.mutate(formData);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">
                        Créer une nouvelle classe
                    </h2>

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Code de la classe *
                                </label>
                                <input
                                    type="text"
                                    value={formData.classId}
                                    onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
                                    className="input"
                                    placeholder="MATH101"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Nombre max d'étudiants *
                                </label>
                                <input
                                    type="number"
                                    value={formData.maxStudents}
                                    onChange={(e) => setFormData({ ...formData, maxStudents: parseInt(e.target.value) })}
                                    className="input"
                                    min="1"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Nom de la classe *
                            </label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="input"
                                placeholder="Mathématiques 101"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Description *
                            </label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="input"
                                rows="3"
                                placeholder="Introduction au calcul différentiel..."
                                required
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Enseignant *
                                </label>
                                <input
                                    type="text"
                                    value={formData.teacher}
                                    onChange={(e) => setFormData({ ...formData, teacher: e.target.value })}
                                    className="input"
                                    placeholder="Prof. Dupont"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Semestre *
                                </label>
                                <input
                                    type="text"
                                    value={formData.semester}
                                    onChange={(e) => setFormData({ ...formData, semester: e.target.value })}
                                    className="input"
                                    placeholder="Automne 2025"
                                    required
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 btn-secondary"
                            >
                                Annuler
                            </button>
                            <button
                                type="submit"
                                disabled={createMutation.isPending}
                                className="flex-1 btn-primary"
                            >
                                {createMutation.isPending ? 'Création...' : 'Créer la classe'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
