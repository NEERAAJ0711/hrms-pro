import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Building2, Loader2, Lock, User, Mail, Eye, EyeOff, ArrowLeft, UserPlus,
  CheckCircle2, Briefcase, Shield, Users, ChevronRight, Zap, Star, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

type SignupType = "select" | "company_admin" | "employee";

const companyAdminSchema = z.object({
  companyName: z.string().min(2, "Company name must be at least 2 characters"),
  fullName: z.string().min(1, "Full name is required"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, { message: "Passwords don't match", path: ["confirmPassword"] });

const employeeSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, { message: "Passwords don't match", path: ["confirmPassword"] });

type CompanyAdminFormData = z.infer<typeof companyAdminSchema>;
type EmployeeFormData = z.infer<typeof employeeSchema>;

export default function SignupPage() {
  const [, setLocation] = useLocation();
  const { signup, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [signupType, setSignupType] = useState<SignupType>("select");

  useEffect(() => {
    if (isAuthenticated) setLocation("/dashboard");
  }, [isAuthenticated, setLocation]);

  const companyAdminForm = useForm<CompanyAdminFormData>({
    resolver: zodResolver(companyAdminSchema),
    defaultValues: { companyName: "", fullName: "", username: "", email: "", password: "", confirmPassword: "" },
  });

  const employeeForm = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
    defaultValues: { fullName: "", username: "", email: "", password: "", confirmPassword: "" },
  });

  const onCompanyAdminSubmit = async (data: CompanyAdminFormData) => {
    setIsLoading(true);
    const nameParts = data.fullName.trim().split(/\s+/);
    try {
      await signup({
        signupType: "company_admin",
        companyName: data.companyName,
        username: data.username,
        email: data.email,
        password: data.password,
        firstName: nameParts[0],
        lastName: nameParts.slice(1).join(" "),
      });
      toast({ title: "Company account created!", description: "Your 3-day free trial has started. Welcome aboard!" });
      setLocation("/dashboard");
    } catch (error: any) {
      toast({ title: "Signup failed", description: error.message || "Could not create account", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const onEmployeeSubmit = async (data: EmployeeFormData) => {
    setIsLoading(true);
    const nameParts = data.fullName.trim().split(/\s+/);
    try {
      await signup({
        signupType: "employee",
        username: data.username,
        email: data.email,
        password: data.password,
        firstName: nameParts[0],
        lastName: nameParts.slice(1).join(" "),
      });
      toast({ title: "Account created!", description: "Welcome! You can now browse job opportunities." });
      setLocation("/dashboard");
    } catch (error: any) {
      toast({ title: "Signup failed", description: error.message || "Could not create account", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-5/12 bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 relative overflow-hidden">
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
            <div className="flex items-center gap-3 mb-8">
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
              <h1 className="text-3xl font-bold leading-tight mb-4">Start Your Journey<br />With Us</h1>
              <p className="text-blue-200 text-base max-w-sm">
                Whether you're a growing business or a job seeker, we have the right solution for you.
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <Building2 className="h-5 w-5 text-blue-300 shrink-0" />
                <div>
                  <p className="font-semibold text-sm">For Companies</p>
                  <p className="text-blue-300 text-xs">Full HRMS — 3 days free trial</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <Briefcase className="h-5 w-5 text-blue-300 shrink-0" />
                <div>
                  <p className="font-semibold text-sm">For Job Seekers</p>
                  <p className="text-blue-300 text-xs">Browse opportunities & apply</p>
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
            <div className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /><span>Free to join</span></div>
            <div className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /><span>No credit card</span></div>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="w-full lg:w-7/12 flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-6 sm:p-8">
        <div className="w-full max-w-lg">
          {/* Mobile header */}
          <div className="lg:hidden mb-6">
            <Link href="/" className="inline-flex items-center gap-2 text-gray-500 hover:text-blue-700 transition-colors mb-4">
              <ArrowLeft className="h-4 w-4" /><span className="text-sm">Back</span>
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

          {/* ───── Step 1: Choose type ───── */}
          {signupType === "select" && (
            <div>
              <div className="mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Create Your Account</h1>
                <p className="text-gray-500 mt-2">Choose how you'd like to sign up</p>
              </div>
              <div className="space-y-4">
                <button
                  onClick={() => setSignupType("company_admin")}
                  data-testid="btn-signup-company"
                  className="w-full text-left flex items-start gap-4 p-5 rounded-2xl border-2 border-blue-200 bg-blue-50 hover:border-blue-500 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:hover:border-blue-500 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Building2 className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-gray-900 dark:text-white text-base">Company Admin</span>
                      <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Zap className="h-2.5 w-2.5" /> 3-Day Free Trial
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Register your company and manage employees, attendance, payroll & more.</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-blue-600 dark:text-blue-400">
                      <span className="flex items-center gap-1"><Star className="h-3 w-3" /> Full HRMS access</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> No credit card</span>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-blue-600 shrink-0 mt-1" />
                </button>

                <button
                  onClick={() => setSignupType("employee")}
                  data-testid="btn-signup-employee"
                  className="w-full text-left flex items-start gap-4 p-5 rounded-2xl border-2 border-gray-200 bg-white hover:border-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-500 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-gray-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Users className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-gray-900 dark:text-white text-base">Employee / Job Seeker</span>
                      <span className="text-[10px] font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Free</span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Browse job openings, submit applications and track your career progress.</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-gray-600 shrink-0 mt-1" />
                </button>
              </div>
              <div className="mt-6 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Already have an account?{" "}
                  <button type="button" onClick={() => setLocation("/login")} className="text-blue-700 hover:underline font-semibold">
                    Sign In
                  </button>
                </p>
              </div>
            </div>
          )}

          {/* ───── Step 2a: Company Admin Form ───── */}
          {signupType === "company_admin" && (
            <div>
              <button onClick={() => setSignupType("select")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-700 mb-6 transition-colors">
                <ArrowLeft className="h-4 w-4" /> Back to signup options
              </button>
              <div className="mb-6">
                <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 px-3 py-1.5 rounded-full text-xs font-semibold mb-3">
                  <Zap className="h-3.5 w-3.5" /> 3-Day Free Trial — No Credit Card Required
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Register Your Company</h1>
                <p className="text-gray-500 mt-1 text-sm">Get full HRMS access for your team instantly</p>
              </div>
              <Form {...companyAdminForm}>
                <form onSubmit={companyAdminForm.handleSubmit(onCompanyAdminSubmit)} className="space-y-4">
                  <FormField control={companyAdminForm.control} name="companyName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700 dark:text-gray-300 font-medium">Company Name</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input placeholder="e.g. Acme Pvt. Ltd." className="pl-10 h-11" data-testid="input-company-name" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={companyAdminForm.control} name="fullName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700 dark:text-gray-300 font-medium">Your Full Name</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input placeholder="John Doe" className="pl-10 h-11" data-testid="input-signup-fullname" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={companyAdminForm.control} name="username" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-700 dark:text-gray-300 font-medium">Username</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input placeholder="johndoe" className="pl-10 h-11" data-testid="input-signup-username" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={companyAdminForm.control} name="email" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-700 dark:text-gray-300 font-medium">Email Address</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input type="email" placeholder="john@acme.com" className="pl-10 h-11" data-testid="input-signup-email" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={companyAdminForm.control} name="password" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-700 dark:text-gray-300 font-medium">Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input type={showPassword ? "text" : "password"} placeholder="Min. 6 chars" className="pl-10 pr-10 h-11" data-testid="input-signup-password" {...field} />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={companyAdminForm.control} name="confirmPassword" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-700 dark:text-gray-300 font-medium">Confirm Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input type={showConfirm ? "text" : "password"} placeholder="Re-enter" className="pl-10 pr-10 h-11" data-testid="input-signup-confirm-password" {...field} />
                            <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <Button type="submit" className="w-full h-11 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-base mt-2" disabled={isLoading} data-testid="button-signup-submit">
                    {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating Account…</> : "Start Free Trial"}
                  </Button>
                  <p className="text-center text-xs text-gray-400">By signing up you agree to our Terms of Service & Privacy Policy</p>
                </form>
              </Form>
            </div>
          )}

          {/* ───── Step 2b: Employee / Job Seeker Form ───── */}
          {signupType === "employee" && (
            <div>
              <button onClick={() => setSignupType("select")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-700 mb-6 transition-colors">
                <ArrowLeft className="h-4 w-4" /> Back to signup options
              </button>
              <div className="mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Create Your Account</h1>
                <p className="text-gray-500 mt-1 text-sm">Sign up to browse positions and apply for jobs</p>
              </div>
              <Form {...employeeForm}>
                <form onSubmit={employeeForm.handleSubmit(onEmployeeSubmit)} className="space-y-4">
                  <FormField control={employeeForm.control} name="fullName" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700 dark:text-gray-300 font-medium">Full Name</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input placeholder="John Doe" className="pl-10 h-11" data-testid="input-signup-fullname" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={employeeForm.control} name="username" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700 dark:text-gray-300 font-medium">Username</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input placeholder="Choose a username" className="pl-10 h-11" data-testid="input-signup-username" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={employeeForm.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700 dark:text-gray-300 font-medium">Email Address</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input type="email" placeholder="john@example.com" className="pl-10 h-11" data-testid="input-signup-email" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={employeeForm.control} name="password" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-700 dark:text-gray-300 font-medium">Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input type={showPassword ? "text" : "password"} placeholder="Min. 6 characters" className="pl-10 pr-10 h-11" data-testid="input-signup-password" {...field} />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={employeeForm.control} name="confirmPassword" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-700 dark:text-gray-300 font-medium">Confirm Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input type={showConfirm ? "text" : "password"} placeholder="Re-enter password" className="pl-10 pr-10 h-11" data-testid="input-signup-confirm-password" {...field} />
                            <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <Button type="submit" className="w-full h-11 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-base mt-2" disabled={isLoading} data-testid="button-signup-submit">
                    {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating Account…</> : "Create Account"}
                  </Button>
                </form>
              </Form>
              <div className="mt-6 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Already have an account?{" "}
                  <button type="button" onClick={() => setLocation("/login")} className="text-blue-700 hover:underline font-semibold" data-testid="link-login">
                    Sign In
                  </button>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
