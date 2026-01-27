

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { classesAPI } from '../services/api';
import MainLayout from '../components/Layout/MainLayout';
import { BookOpen, Users, Award, TrendingUp } from 'lucide-react';

export default function DashboardPage() {
    const { user, isTeacher } = useAuth();

    const { data: classesData, isLoading } = useQuery({
        queryKey: ['classes'],
        queryFn: async () => {
            const response = await classesAPI.getAll();
            return response.data.data;
        },
    });

    const stats = [
        {
            name: 'Classes disponibles',
            value: classesData?.length || 0,
            icon: BookOpen,
            color: 'bg-blue-500',
        },
        {
            name: 'Étudiants inscrits',
            value: '245',
            icon: Users,
            color: 'bg-green-500',
        },
        {
            name: 'Examens à venir',
            value: '12',
            icon: Award,
            color: 'bg-purple-500',
        },
        {
            name: 'Taux de réussite',
            value: '94%',
            icon: TrendingUp,
            color: 'bg-orange-500',
        },
    ];

    return (
        <MainLayout>
            <div className="space-y-6">
                {/* En-tête */}
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">
                        Bienvenue, {user?.username} 👋
                    </h1>
                    <p className="mt-1 text-gray-600">
                        {isTeacher
                            ? 'Gérez vos classes et suivez vos étudiants'
                            : 'Consultez vos cours et vos notes'}
                    </p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {stats.map((stat) => {
                        const Icon = stat.icon;
                        return (
                            <div key={stat.name} className="card">
                                <div className="flex items-center gap-4">
                                    <div className={`${stat.color} w-12 h-12 rounded-lg flex items-center justify-center`}>
                                        <Icon className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600">{stat.name}</p>
                                        <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Classes récentes */}
                <div className="card">
                    <h2 className="text-xl font-bold text-gray-900 mb-4">
                        {isTeacher ? 'Vos classes' : 'Classes disponibles'}
                    </h2>

                    {isLoading ? (
                        <div className="text-center py-12">
                            <div className="inline-block w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {classesData?.slice(0, 6).map((classItem) => (
                                <div
                                    key={classItem.classId}
                                    className="p-4 border border-gray-200 rounded-lg hover:border-primary-500 hover:shadow-md transition-all cursor-pointer"
                                    onClick={() => window.location.href = `/classes/${classItem.classId}`}
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <h3 className="font-semibold text-gray-900">
                                            {classItem.name}
                                        </h3>
                                        <span className="badge badge-blue">
                                            {classItem.classId}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-600 mb-3">
                                        {classItem.description}
                                    </p>
                                    <div className="flex items-center justify-between text-xs text-gray-500">
                                        <span>👨‍🏫 {classItem.teacher}</span>
                                        <span>📅 {classItem.semester}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Info blockchain */}
                <div className="bg-primary-50 border border-primary-200 rounded-xl p-6">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="font-semibold text-primary-900 mb-1">
                                🔐 Sécurisé par la Blockchain
                            </h3>
                            <p className="text-sm text-primary-800">
                                Toutes vos données académiques sont stockées de manière décentralisée et immuable 
                                sur Hyperledger Fabric. Vos notes, inscriptions et documents sont garantis authentiques 
                                et vérifiables.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
}
