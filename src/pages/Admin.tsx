import React from 'react';
import { Link } from 'react-router-dom';

export default function Admin() {
  const adminFeatures = [
    {
      title: 'CSV Import',
      description: 'Import weekly scoring data from CSV files',
      path: '/admin/import',
      icon: '📊',
      color: 'bg-blue-500'
    },
    {
      title: 'Data Migration',
      description: 'Migrate historical data to database',
      path: '/admin/migration',
      icon: '🔄',
      color: 'bg-green-500'
    }
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>
      
      <div className="grid md:grid-cols-2 gap-6">
        {adminFeatures.map((feature) => (
          <Link
            key={feature.path}
            to={feature.path}
            className="block bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow"
          >
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className={`w-12 h-12 ${feature.color} rounded-lg flex items-center justify-center text-white text-2xl mr-4`}>
                  {feature.icon}
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{feature.title}</h2>
                </div>
              </div>
              <p className="text-gray-600">{feature.description}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start">
          <div className="text-yellow-600 mr-3">⚠️</div>
          <div>
            <h3 className="font-semibold text-yellow-800">Admin Access Required</h3>
            <p className="text-yellow-700 text-sm mt-1">
              These features are for administrators only. Make sure you have the proper permissions before making changes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
