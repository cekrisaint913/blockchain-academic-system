

import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { classesAPI } from '../services/api';
import MainLayout from '../components/Layout/MainLayout';
import { ArrowLeft, Users, Calendar, BookOpen, FileText, Award } from 'lucide-react';

export default function ClassDetailPage() {
    const { classId } = useParams();
    const { user, isStudent } = useAuth();
    const queryClient = useQueryClient();

    const { data: classData, isLoading } = useQuery({
        queryKey: ['class', classId],
        queryFn: async () => {
            const response = await classesAPI.getById(classId);
            return response.data.data;
        },
    });

    const { data: materials } = useQuery({
        queryKey: ['materials', classId],
        queryFn: async () => {
            const response = await classesAPI.getMaterials(classId);
            return response.data.data;
        },
        enabled: !!classData,
    });

    const enrollMutation = useMutation({
        mutationFn: () => classesAPI.enroll(classId, user.username),
        onSuccess: () => {
            queryClient.invalidateQueries(['class', classId]);
            alert('Inscription réussie !');
        },
        onError: (error) => {
            alert(error.response?.data?.error || 'Erreur lors de l\'inscription');
        },
    });

    if (isLoading) {
        return (
            <MainLayout>
                <div className="text-center py-12">
                    <div className="inline-block w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout>
            <div className="space-y-6">
                {/* Retour */}
                <Link to="/classes" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900">
                    <ArrowLeft className="w-4 h-4" />
                    Retour aux classes
                </Link>

                {/* En-tête */}
                <div className="card">
                    <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                            <div className="w-16 h-16 bg-primary-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                <BookOpen className="w-8 h-8 text-primary-600" />
                            </div>
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <h1 className="text-3xl font-bold text-gray-900">
                                        {classData?.name}
                                    </h1>
                                    <span className="badge badge-blue">
                                        {classData?.classId}
                                    </span>
                                </div>
                                <p className="text-gray-600 mb-4">
                                    {classData?.description}
                                </p>
                                <div className="flex items-center gap-6 text-sm text-gray-600">
                                    <div className="flex items-center gap-2">
                                        <Users className="w-4 h-4" />
                                        <span>{classData?.teacher}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Calendar className="w-4 h-4" />
                                        <span>{classData?.semester}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Award className="w-4 h-4" />
                                        <span>Max: {classData?.maxStudents} étudiants</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        {isStudent && (
                            <button
                                onClick={() => enrollMutation.mutate()}
                                disabled={enrollMutation.isPending}
                                className="btn-primary"
                            >
                                {enrollMutation.isPending ? 'Inscription...' : 'S\'inscrire'}
                            </button>
                        )}
                    </div>
                </div>

                {/* Supports de cours */}
                <div className="card">
                    <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        Supports de cours
                    </h2>

                    {materials && materials.length > 0 ? (
                        <div className="space-y-3">
                            {materials.map((material) => (
                                <div
                                    key={material.materialId}
                                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-primary-500 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                                            <FileText className="w-5 h-5 text-gray-600" />
                                        </div>
                                        <div>
                                            <h4 className="font-medium text-gray-900">
                                                {material.title}
                                            </h4>
                                            <p className="text-sm text-gray-500">
                                                {material.type} • IPFS: {material.ipfsHash?.substring(0, 12)}...
                                            </p>
                                        </div>
                                    </div>
                                    <button className="btn-secondary text-sm">
                                        Télécharger
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-500">
                            Aucun support de cours disponible pour le moment
                        </div>
                    )}
                </div>

                {/* Informations blockchain */}
                <div className="bg-green-50 border border-green-200 rounded-xl p-6">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center flex-shrink-0">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="font-semibold text-green-900 mb-1">
                                Données vérifiées sur la blockchain
                            </h3>
                            <p className="text-sm text-green-800">
                                Cette classe est enregistrée sur Hyperledger Fabric. 
                                Toutes les inscriptions et données sont immuables et vérifiables.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
}
