import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input, Card } from '@/components/ui';
import { resetPassword } from '@/api/auth.api';
import { getErrorMessage } from '@/api/client';

const resetSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type ResetForm = z.infer<typeof resetSchema>;

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    // Supabase puts the token in the URL hash: #access_token=...&type=recovery
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const token = params.get('access_token');
    const type = params.get('type');

    if (token && type === 'recovery') {
      setAccessToken(token);
    } else if (!token) {
      setError('Invalid or missing reset link. Please request a new one.');
    }
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
  });

  const onSubmit = async (data: ResetForm) => {
    if (!accessToken) return;
    setError(null);
    setIsLoading(true);
    try {
      await resetPassword(accessToken, data.password);
      setSuccess(true);
      setTimeout(() => navigate('/login', { replace: true }), 3000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-iron">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">
            Algo<span className="text-crimson">Split</span>
          </h1>
          <p className="text-secondary mt-2">Set a new password</p>
        </div>

        <Card>
          {success ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-foreground">
                Password reset successfully! Redirecting to sign in...
              </p>
              <Link
                to="/login"
                className="text-crimson hover:text-crimson-hover font-medium text-sm"
              >
                Sign in now
              </Link>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {error && (
                  <div className="p-3 bg-error/10 border border-error/20 rounded-md">
                    <p className="text-sm text-error">{error}</p>
                  </div>
                )}

                <Input
                  label="New Password"
                  type="password"
                  placeholder="Enter new password"
                  hint="Must be at least 8 characters"
                  error={errors.password?.message}
                  disabled={!accessToken}
                  {...register('password')}
                />

                <Input
                  label="Confirm Password"
                  type="password"
                  placeholder="Confirm new password"
                  error={errors.confirmPassword?.message}
                  disabled={!accessToken}
                  {...register('confirmPassword')}
                />

                <Button
                  type="submit"
                  className="w-full"
                  loading={isLoading}
                  disabled={!accessToken}
                >
                  Reset Password
                </Button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-sm text-secondary">
                  <Link
                    to="/forgot-password"
                    className="text-crimson hover:text-crimson-hover font-medium"
                  >
                    Request a new reset link
                  </Link>
                </p>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
