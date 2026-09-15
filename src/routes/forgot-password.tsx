import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotPasswordForm } from "@/components/login/forgot-password-form";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 px-6 py-10">
      <div className="text-center">
        <Link
          to="/"
          className="inline-flex items-center gap-2.5 font-serif text-2xl tracking-label-xwide"
        >
          <img src="/favicon.svg" alt="" className="size-7" />
          MILA
        </Link>
        <p className="atelier-kicker mt-3">Reset your password</p>
      </div>

      <Card className="w-full max-w-sm border-border/60 shadow-sm">
        <CardHeader className="space-y-1.5 pb-4">
          <CardTitle className="font-serif text-xl">Forgot password?</CardTitle>
          <CardDescription className="text-xs">
            Enter your studio email and we&apos;ll send you a link to reset it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm />
        </CardContent>
      </Card>

      <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
        Back to sign in
      </Link>
    </div>
  );
}
