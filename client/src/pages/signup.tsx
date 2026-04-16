import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Building2, Loader2, Lock, User, Mail, Eye, EyeOff, ArrowLeft, UserPlus, CheckCircle2, Briefcase, Globe, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

const signupSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
  fullName: z.string().min(1, "Full name is required"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type SignupFormData = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const [location, setLocation] = useLocation();
  const { signup, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, setLocation]);

  const form = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      fullName: "",
    },
  });

  const onSubmit = async (data: SignupFormData) => {
    setIsLoading(true);
    const nameParts = data.fullName.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
    try {
      await signup({
        username: data.username,
        email: data.email,
        password: data.password,
        firstName,
        lastName,
      });
      toast({
        title: "Account created!",
        description: "Welcome to TBJ Vision Connect ERP. You are now logged in.",
      });
      setLocation("/dashboard");
    } catch (error: any) {
      toast({
        title: "Signup failed",
        description: error.message || "Could not create account",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-5/12 bg-gradient-to-br from-blue-800 via-blue-700 to-blue-900 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-300 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div>
            <Link href="/" className="inline-flex items-center gap-2 text-blue-200 hover:text-white transition-colors mb-8">
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm">Back to Website</span>
            </Link>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-sm border border-white/20">
                <Building2 className="h-7 w-7 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold">TBJ VISION CONNECT</h2>
                <p className="text-[10px] text-blue-300 tracking-[0.2em]">PVT. LTD.</p>
              </div>
            </div>
          </div>
          <div className="space-y-8">
            <div>
              <h1 className="text-3xl font-bold leading-tight mb-4">Join Our<br />Growing Network</h1>
              <p className="text-blue-200 text-base max-w-sm">
                Create your account to access job opportunities and manage your professional profile.
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <Briefcase className="h-5 w-5 text-blue-300 shrink-0" />
                <div>
                  <p className="font-semibold text-sm">Browse Open Positions</p>
                  <p className="text-blue-300 text-xs">Find your next career opportunity</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <Globe className="h-5 w-5 text-blue-300 shrink-0" />
                <div>
                  <p className="font-semibold text-sm">Pan-India Opportunities</p>
                  <p className="text-blue-300 text-xs">Positions across multiple cities</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <Shield className="h-5 w-5 text-blue-300 shrink-0" />
                <div>
                  <p className="font-semibold text-sm">Secure & Confidential</p>
                  <p className="text-blue-300 text-xs">Your data is always protected</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-blue-300">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              <span>Free to join</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              <span>No obligations</span>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-7/12 flex items-center justify-center bg-gray-50 p-6 sm:p-8">
        <div className="w-full max-w-lg">
          <div className="lg:hidden mb-6">
            <Link href="/" className="inline-flex items-center gap-2 text-gray-500 hover:text-blue-700 transition-colors mb-4">
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm">Back to Website</span>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-700 rounded-lg flex items-center justify-center">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-blue-800">TBJ VISION CONNECT</h2>
                <p className="text-[9px] text-gray-500 tracking-[0.2em]">PVT. LTD.</p>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Create Your Account</h1>
            <p className="text-gray-500 mt-2">Sign up to browse open positions and apply for jobs</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-700 font-medium">Full Name</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="John Doe"
                          className="pl-10 h-11 bg-white border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                          data-testid="input-signup-fullname"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-700 font-medium">Username</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Choose a username"
                          className="pl-10 h-11 bg-white border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                          data-testid="input-signup-username"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-700 font-medium">Email Address</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          type="email"
                          placeholder="john@example.com"
                          className="pl-10 h-11 bg-white border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                          data-testid="input-signup-email"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700 font-medium">Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Min. 6 characters"
                            className="pl-10 pr-10 h-11 bg-white border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                            data-testid="input-signup-password"
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700 font-medium">Confirm Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input
                            type={showConfirm ? "text" : "password"}
                            placeholder="Re-enter password"
                            className="pl-10 pr-10 h-11 bg-white border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                            data-testid="input-signup-confirm-password"
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirm(!showConfirm)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button
                type="submit"
                className="w-full h-11 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-base mt-2"
                disabled={isLoading}
                data-testid="button-signup-submit"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  "Create Account"
                )}
              </Button>
            </form>
          </Form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => setLocation("/login")}
                className="text-blue-700 hover:text-blue-800 font-semibold hover:underline"
                data-testid="link-login"
              >
                Sign In
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
