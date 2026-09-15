import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ArrowRight, Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordVisibilityButton } from "@/components/ui/password-visibility-button";
import { useCaptcha } from "@/components/login/use-captcha";
import { passwordChecks } from "@/constants/password";
import { requireStaffRoutePermission } from "@/lib/staff-route";
import { errorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_authed/settings")({
  beforeLoad: ({ context }) => requireStaffRoutePermission(context.queryClient, "admin.access"),
  component: SettingsPage,
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(8, { message: "Enter your current password." }),
    newPassword: z.string().min(8, { message: "Password must be at least 8 characters." }),
    confirmPassword: z.string().min(8, { message: "Please confirm your new password." }),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

function SettingsPage() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const captcha = useCaptcha();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    watch,
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const newPassword = watch("newPassword") ?? "";
  const passedChecks = passwordChecks.filter((c) => c.test(newPassword)).length;
  const passwordOk = passedChecks === passwordChecks.length;
  const strength =
    passedChecks <= 2
      ? { label: "Weak", bar: "bg-destructive", text: "text-destructive" }
      : passedChecks < passwordChecks.length
        ? { label: "Medium", bar: "bg-amber-500", text: "text-amber-600" }
        : { label: "Strong", bar: "bg-emerald-500", text: "text-emerald-600" };

  const onSubmit = async (data: ChangePasswordValues) => {
    if (!user?.email) return;
    if (!passwordOk) {
      toast.error("New password does not meet the security requirements yet.");
      return;
    }
    if (!captcha.token) {
      toast.error("Please complete the captcha challenge.");
      return;
    }
    setBusy(true);
    try {
      // Re-authenticate with the current password before allowing a change —
      // a stolen/left-open session shouldn't be enough on its own.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: data.currentPassword,
        options: { captchaToken: captcha.token },
      });
      if (reauthError) throw new Error("Current password is incorrect.");
      const { error } = await supabase.auth.updateUser({ password: data.newPassword });
      if (error) throw error;
      toast.success("Password updated.");
      reset();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't update your password."));
    } finally {
      captcha.reset();
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md">
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="space-y-1.5 pb-4">
          <CardTitle className="font-serif text-xl">Change Password</CardTitle>
          <CardDescription className="text-xs">
            Signed in as {user?.email}. This takes effect immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="current-password" className="text-xs">
                Current Password
              </Label>
              <div className="relative">
                <Input
                  id="current-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="h-10 pr-10"
                  {...register("currentPassword")}
                />
                <PasswordVisibilityButton
                  visible={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                />
              </div>
              {errors.currentPassword && (
                <p className="text-xs text-destructive">{errors.currentPassword.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="text-xs">
                New Password
              </Label>
              <Input
                id="new-password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                className="h-10"
                {...register("newPassword")}
              />
              {errors.newPassword && (
                <p className="text-xs text-destructive">{errors.newPassword.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-xs">
                Confirm New Password
              </Label>
              <Input
                id="confirm-password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                className="h-10"
                {...register("confirmPassword")}
              />
              {errors.confirmPassword && (
                <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
              )}
            </div>

            {newPassword && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${strength.bar}`}
                      style={{ width: `${(passedChecks / passwordChecks.length) * 100}%` }}
                    />
                  </div>
                  <span
                    className={`text-micro font-medium uppercase tracking-wider ${strength.text}`}
                  >
                    {strength.label}
                  </span>
                </div>
                <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {passwordChecks.map((c) => {
                    const ok = c.test(newPassword);
                    return (
                      <li
                        key={c.label}
                        className={`flex items-center gap-1.5 text-label ${
                          ok ? "text-emerald-600" : "text-muted-foreground"
                        }`}
                      >
                        {ok ? <Check className="size-3" /> : <X className="size-3" />}
                        {c.label}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {captcha.field}

            <Button
              type="submit"
              disabled={busy || !passwordOk || !captcha.token}
              className="w-full h-10 gap-2"
            >
              {busy ? "Please wait…" : "Update Password"}
              <ArrowRight className="size-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
