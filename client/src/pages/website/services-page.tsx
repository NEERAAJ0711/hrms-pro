import { Link } from "wouter";
import {
  Users, Calculator, Shield, Clock, FileCheck, Briefcase,
  Building, HeartHandshake, GraduationCap, ArrowRight,
  CheckCircle2, Scale, HardHat
} from "lucide-react";

const services = [
  {
    icon: Users,
    title: "HR Management & Outsourcing",
    desc: "Complete HR operations management including employee lifecycle, record keeping, policy drafting, and HR advisory services.",
    features: [
      "Employee onboarding and exit management",
      "HR policy development and implementation",
      "Employee grievance handling",
      "Performance management support",
      "Digital HR record maintenance",
    ],
  },
  {
    icon: Calculator,
    title: "Payroll Processing",
    desc: "End-to-end payroll management with accurate calculations, statutory compliance, and timely disbursement.",
    features: [
      "Monthly salary processing with all components",
      "Statutory deductions (PF, ESI, PT, TDS)",
      "Payslip generation and distribution",
      "Full & Final settlement processing",
      "Bank transfer and reconciliation",
    ],
  },
  {
    icon: Shield,
    title: "Statutory Compliance",
    desc: "Comprehensive compliance management covering all central and state labor laws applicable to your business.",
    features: [
      "PF registration and monthly returns (ECR)",
      "ESI registration and contribution filing",
      "Professional Tax registration and payments",
      "Labour Welfare Fund management",
      "Bonus calculation and disbursement",
    ],
  },
  {
    icon: Scale,
    title: "Labour Law Advisory",
    desc: "Expert legal guidance on employment laws, regulations, and best practices to keep your business compliant.",
    features: [
      "Shops & Establishment Act compliance",
      "Minimum Wages Act advisory",
      "Payment of Wages Act compliance",
      "Contract Labour regulation",
      "Industrial Disputes Act guidance",
    ],
  },
  {
    icon: Clock,
    title: "Attendance & Leave Management",
    desc: "Automated attendance tracking with biometric integration, shift scheduling, and leave policy management.",
    features: [
      "Biometric device integration",
      "Shift and roster management",
      "Leave policy configuration",
      "Overtime calculation and tracking",
      "Real-time attendance dashboards",
    ],
  },
  {
    icon: Briefcase,
    title: "Recruitment & Staffing",
    desc: "End-to-end recruitment support from job posting to candidate onboarding with a streamlined hiring process.",
    features: [
      "Job posting and candidate sourcing",
      "Screening and interview coordination",
      "Offer letter and documentation",
      "Background verification support",
      "Onboarding process management",
    ],
  },
  {
    icon: HardHat,
    title: "Manpower Supply & Staffing",
    desc: "Reliable manpower supply services across industries. We provide skilled, semi-skilled, and unskilled workforce to organizations pan-India.",
    features: [
      "Manpower supply for manufacturing & industrial sectors",
      "Skilled, semi-skilled, and unskilled workforce deployment",
      "Contract staffing and temporary manpower solutions",
      "Housekeeping, security, and facility management staff",
      "IT and office support staff outsourcing",
    ],
  },
  {
    icon: Building,
    title: "Company Registration & Licensing",
    desc: "Assistance with business formation, registration, and obtaining all necessary licenses and permits.",
    features: [
      "Company incorporation assistance",
      "MSME/Udyam registration",
      "Trade license and permits",
      "GST registration support",
      "FSSAI and other sector-specific licenses",
    ],
  },
  {
    icon: HeartHandshake,
    title: "Employee Benefits & Insurance",
    desc: "Designing and managing employee benefit programs including insurance, wellness, and retirement plans.",
    features: [
      "Group health insurance management",
      "Gratuity calculation and compliance",
      "Employee wellness programs",
      "Superannuation and NPS advisory",
      "Leave encashment management",
    ],
  },
  {
    icon: GraduationCap,
    title: "Training & Development",
    desc: "Customized training programs for employee skill development, compliance awareness, and leadership growth.",
    features: [
      "Compliance and safety training",
      "Soft skills development",
      "Leadership and management programs",
      "Industry-specific skill training",
      "Training needs assessment",
    ],
  },
];

export default function ServicesPage() {
  return (
    <div>
      <section className="bg-gradient-to-br from-blue-800 to-blue-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Our Services</h1>
          <p className="text-blue-100 max-w-2xl mx-auto text-lg">
            Comprehensive HR, payroll, and compliance solutions designed to let you focus on growing your business.
          </p>
        </div>
      </section>

      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-8">
            {services.map((service, i) => (
              <div
                key={i}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="p-6 md:p-8">
                  <div className="flex flex-col md:flex-row md:items-start gap-6">
                    <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                      <service.icon className="h-7 w-7 text-blue-700" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-gray-900 mb-2">{service.title}</h3>
                      <p className="text-gray-600 mb-4">{service.desc}</p>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {service.features.map((feature, j) => (
                          <div key={j} className="flex items-center gap-2 text-sm text-gray-700">
                            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                            <span>{feature}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-blue-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold mb-4">Need a Customized Solution?</h2>
          <p className="text-blue-100 mb-8 max-w-xl mx-auto">
            Every business is unique. Contact us to discuss how we can tailor our services to your specific requirements.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 bg-white text-blue-800 px-8 py-3 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
          >
            Contact Us <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
