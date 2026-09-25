import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import AuthForm, { type AuthFormMode } from './AuthForm';

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: AuthFormMode;
  /** When true, navigate to /my-leagues after successful auth. Off for AuthCheck (stay on protected route). */
  redirectOnSuccess?: boolean;
}

const SignInModal: React.FC<SignInModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'signin',
  redirectOnSuccess = false,
}) => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthFormMode>(initialMode);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setFormKey((k) => k + 1);
    }
  }, [isOpen, initialMode]);

  const handleModeChange = useCallback((next: AuthFormMode) => {
    setMode(next);
  }, []);

  const handleSuccess = () => {
    onClose();
    if (redirectOnSuccess) {
      navigate('/my-leagues');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md w-full">
        <DialogHeader>
          <DialogTitle>
            {mode === 'signin' ? 'Sign In' : 'Create Account'}
          </DialogTitle>
        </DialogHeader>
        <AuthForm
          key={formKey}
          initialMode={initialMode}
          onModeChange={handleModeChange}
          onSuccess={handleSuccess}
        />
      </DialogContent>
    </Dialog>
  );
};

export default SignInModal;
