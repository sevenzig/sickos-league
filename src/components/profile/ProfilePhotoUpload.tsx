import React, { useState, useRef } from 'react';
import { MultiLeagueApi } from '../../utils/multiLeagueApi';

interface ProfilePhotoUploadProps {
  currentPhotoUrl?: string;
  onPhotoUpdated: (photoUrl: string | null) => void;
  className?: string;
}

const ProfilePhotoUpload: React.FC<ProfilePhotoUploadProps> = ({
  currentPhotoUrl,
  onPhotoUpdated,
  className = ''
}) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    const maxSize = 1024 * 1024; // 1MB
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

    if (file.size > maxSize) {
      return 'File size must be less than 1MB';
    }

    if (!allowedTypes.includes(file.type)) {
      return 'Only JPEG, PNG, WebP, and GIF files are allowed';
    }

    return null;
  };

  const handleFileUpload = async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const photoUrl = await MultiLeagueApi.uploadProfilePhoto(file);

      // Only update the UI, don't save to database yet
      // The parent component will handle the database update
      onPhotoUpdated(photoUrl);
    } catch (err) {
      console.error('Error uploading photo:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleRemovePhoto = async () => {
    setUploading(true);
    setError(null);

    try {
      await MultiLeagueApi.deleteProfilePhoto();

      // Only update the UI, don't save to database yet
      // The parent component will handle the database update
      onPhotoUpdated(null);
    } catch (err) {
      console.error('Error removing photo:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove photo');
    } finally {
      setUploading(false);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center gap-6">
        {/* Current Photo Display */}
        <div className="flex-shrink-0">
          <div className="relative">
            {currentPhotoUrl ? (
              <img
                src={currentPhotoUrl}
                alt="Profile"
                className="w-20 h-20 rounded-full object-cover border-3 border-slate-600"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border-3 border-slate-600 flex items-center justify-center">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            )}

            {uploading && (
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
              </div>
            )}
          </div>
        </div>

        {/* Upload Info */}
        <div className="flex-1">
          <div className="space-y-3">
            <div>
              <p className="text-slate-300 font-medium text-sm">
                Profile Photo
              </p>
              <p className="text-slate-400 text-xs">
                PNG, JPG, WebP or GIF up to 1MB
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-600/10 border border-red-600/20 rounded-lg p-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 mt-4">
        <button
          onClick={triggerFileSelect}
          disabled={uploading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          {uploading ? 'Uploading...' : currentPhotoUrl ? 'Change Photo' : 'Upload Photo'}
        </button>

        {currentPhotoUrl && (
          <button
            onClick={handleRemovePhoto}
            disabled={uploading}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            Remove Photo
          </button>
        )}
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
};

export default ProfilePhotoUpload;