import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input, Card } from '@/components/ui';
import { forgotPassword } from '@/api/auth.api';
import { getErrorMessage } from '@/api/client';

const forgotSchema = z.object({
  email: z.string().email('Invalid email address'),
});

type ForgotForm = z.infer<typeof forgotSchema>;

export function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
  });

  const onSubmit = async (data: ForgotForm) => {
    setError(null);
    setIsLoading(true);
    try {
      await forgotPassword(data.email);
      setSubmitted(true);
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
          <p className="text-secondary mt-2">Reset your password</p>
        </div>

        <Card>
          {submitted ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-foreground">
                If an account with that email exists, we've sent a password reset link.
                Check your inbox.
              </p>
              <Link
                to="/login"
                className="text-crimson hover:text-crimson-hover font-medium text-sm"
              >
                Back to sign in
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

                <p className="text-sm text-secondary">
                  Enter your email and we'll send you a link to reset your password.
                </p>

                <Input
                  label="Email"
                  type="email"
                  placeholder="you@example.com"
                  error={errors.email?.message}
                  {...register('email')}
                />

                <Button
                  type="submit"
                  className="w-full"
                  loading={isLoading}
                >
                  Send Reset Link
                </Button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-sm text-secondary">
                  Remember your password?{' '}
                  <Link
                    to="/login"
                    className="text-crimson hover:text-crimson-hover font-medium"
                  >
                    Sign in
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
