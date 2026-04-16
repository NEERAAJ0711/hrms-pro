import { Link } from "wouter";
import {
  Users, Shield, Calculator, Clock, FileCheck, Building2,
  ChevronRight, CheckCircle2, ArrowRight, Star, TrendingUp,
  Briefcase, Globe
} from "lucide-react";

const stats = [
  { value: "500+", label: "Clients Served", icon: Building2 },
  { value: "50,000+", label: "Employees Managed", icon: Users },
  { value: "100%", label: "Compliance Rate", icon: Shield },
  { value: "10+", label: "Years Experience", icon: TrendingUp },
];

const services = [
  {
    icon: Users,
    title: "HR Management",
    desc: "Complete employee lifecycle management from onboarding to exit with digital record keeping.",
  },
  {
    icon: Calculator,
    title: "Payroll Processing",
    desc: "Accurate and timely salary processing with statutory deductions, TDS, and bank transfers.",
  },
  {
    icon: Shield,
    title: "Statutory Compliance",
    desc: "PF, ESI, PT, LWF, and all labor law compliances handled with precision and on-time filings.",
  },
  {
    icon: Clock,
    title: "Attendance & Leave",
    desc: "Biometric integration, shift management, and automated leave policies for seamless tracking.",
  },
  {
    icon: FileCheck,
    title: "Labour Law Advisory",
    desc: "Expert guidance on Shops & Establishment Act, Minimum Wages, Bonus Act, and more.",
  },
  {
    icon: Briefcase,
    title: "Recruitment Solutions",
    desc: "End-to-end hiring support from job posting to offer management and onboarding.",
  },
];

const whyUs = [
  "Pan-India compliance expertise",
  "Dedicated account managers",
  "Real-time cloud-based ERP access",
  "100% statutory compliance guarantee",
  "Customized solutions for every business size",
  "Data security and confidentiality assured",
];

export default function HomePage() {
  return (
    <div>
      <section className="relative bg-gradient-to-br from-blue-800 via-blue-700 to-blue-900 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-20 w-96 h-96 bg-blue-300 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-blue-600/50 rounded-full px-4 py-1.5 text-sm mb-6">
                <Star className="h-4 w-4 text-yellow-300" />
                <span>Trusted HR & Compliance Partner</span>
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6">
                Empowering Your <span className="text-blue-300">Workforce</span> Management
              </h1>
              <p className="text-lg text-blue-100 mb-8 max-w-lg">
                TBJ VISION CONNECT PVT. LTD. delivers end-to-end HR solutions, payroll management, and statutory compliance services to businesses across India.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-2 bg-white text-blue-800 px-6 py-3 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
                >
                  Get Started <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/services"
                  className="inline-flex items-center gap-2 border-2 border-white/30 text-white px-6 py-3 rounded-lg font-semibold hover:bg-white/10 transition-colors"
                >
                  Our Services <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
            <div className="hidden md:flex justify-center">
              <div className="relative">
                <div className="w-80 h-80 bg-blue-600/30 rounded-3xl border border-white/10 backdrop-blur-sm p-8 flex flex-col justify-center items-center text-center">
                  <Globe className="h-20 w-20 text-blue-300 mb-4" />
                  <h3 className="text-xl font-bold mb-2">Pan-India Presence</h3>
                  <p className="text-blue-200 text-sm">Serving businesses in every major city with local compliance expertise</p>
                </div>
                <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-blue-500/30 rounded-2xl border border-white/10 backdrop-blur-sm flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-2xl font-bold">24/7</div>
                    <div className="text-xs text-blue-200">Support</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((stat, i) => (
              <div key={i} className="text-center p-6 rounded-xl bg-gray-50 hover:bg-blue-50 transition-colors">
                <stat.icon className="h-8 w-8 text-blue-700 mx-auto mb-3" />
                <div className="text-3xl font-bold text-gray-900">{stat.value}</div>
                <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Our Services</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Comprehensive HR and compliance solutions tailored to meet the diverse needs of businesses across India.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((service, i) => (
              <div
                key={i}
                className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-lg hover:border-blue-200 transition-all group"
              >
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-700 transition-colors">
                  <service.icon className="h-6 w-6 text-blue-700 group-hover:text-white transition-colors" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{service.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{service.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link
              href="/services"
              className="inline-flex items-center gap-2 text-blue-700 font-semibold hover:text-blue-800 transition-colors"
            >
              View All Services <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
                Why Choose <span className="text-blue-700">TBJ Vision Connect?</span>
              </h2>
              <p className="text-gray-600 mb-8">
                We bring years of expertise in HR management and statutory compliance, backed by cutting-edge technology and a client-first approach.
              </p>
              <ul className="space-y-3">
                {whyUs.map((item, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                    <span className="text-gray-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-gradient-to-br from-blue-700 to-blue-900 rounded-2xl p-8 text-white">
              <h3 className="text-2xl font-bold mb-6">Our ERP Platform</h3>
              <p className="text-blue-100 mb-6">
                Access our cloud-based HRMS platform for real-time employee management, payroll processing, and compliance tracking.
              </p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-blue-100">
                  <CheckCircle2 className="h-4 w-4 text-blue-300" />
                  Multi-company management
                </li>
                <li className="flex items-center gap-2 text-blue-100">
                  <CheckCircle2 className="h-4 w-4 text-blue-300" />
                  Automated payroll with statutory deductions
                </li>
                <li className="flex items-center gap-2 text-blue-100">
                  <CheckCircle2 className="h-4 w-4 text-blue-300" />
                  Biometric attendance integration
                </li>
                <li className="flex items-center gap-2 text-blue-100">
                  <CheckCircle2 className="h-4 w-4 text-blue-300" />
                  Mobile app for employees
                </li>
              </ul>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 bg-white text-blue-800 px-6 py-3 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
              >
                Login to ERP <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-blue-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Streamline Your HR Operations?</h2>
          <p className="text-blue-100 mb-8 max-w-2xl mx-auto">
            Join hundreds of businesses that trust TBJ Vision Connect for their HR management and compliance needs.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 bg-white text-blue-800 px-8 py-3 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
            >
              Contact Us Today <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 border-2 border-white/30 text-white px-8 py-3 rounded-lg font-semibold hover:bg-white/10 transition-colors"
            >
              Sign Up for ERP
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
