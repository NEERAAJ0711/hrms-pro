import { Link } from "wouter";
import {
  Shield, FileCheck, Calculator, Scale, Building2,
  CheckCircle2, ArrowRight, AlertTriangle, BookOpen
} from "lucide-react";

const complianceAreas = [
  {
    icon: Shield,
    title: "Provident Fund (PF / EPF)",
    desc: "Complete management of Employee Provident Fund compliance under the EPF & MP Act, 1952.",
    items: [
      "PF registration for new establishments",
      "Monthly ECR filing and challan generation",
      "Employee PF account transfers (Form 13)",
      "PF withdrawal and advance claim assistance",
      "Annual PF return filing",
      "UAN activation and KYC updates",
    ],
  },
  {
    icon: FileCheck,
    title: "Employee State Insurance (ESI)",
    desc: "End-to-end ESIC compliance management for employers and employees under the ESI Act, 1948.",
    items: [
      "ESIC registration for establishments",
      "Monthly contribution filing",
      "Employee IP generation and linking",
      "Accident and sickness benefit claims",
      "Half-yearly return filing",
      "ESIC inspection support",
    ],
  },
  {
    icon: Calculator,
    title: "Professional Tax (PT)",
    desc: "State-wise Professional Tax registration, calculation, and return filing across India.",
    items: [
      "PT registration in applicable states",
      "Monthly/annual PT calculation as per slabs",
      "Timely challan payment and filing",
      "PT return submission",
      "Multi-state PT compliance management",
      "PT audit support",
    ],
  },
  {
    icon: Scale,
    title: "Labour Welfare Fund (LWF)",
    desc: "Management of Labour Welfare Fund contributions as per state-specific requirements.",
    items: [
      "LWF registration",
      "Employee and employer contribution calculation",
      "Bi-annual/annual contribution filing",
      "State-specific compliance tracking",
      "LWF return submission",
    ],
  },
  {
    icon: BookOpen,
    title: "Shops & Establishment Act",
    desc: "Compliance with state-specific Shops & Establishment regulations for all business premises.",
    items: [
      "Shop registration and renewal",
      "Working hours and overtime compliance",
      "Leave and holiday policy alignment",
      "Employment condition records",
      "Inspection and audit readiness",
    ],
  },
  {
    icon: Building2,
    title: "Contract Labour Compliance",
    desc: "Ensuring compliance under the Contract Labour (Regulation & Abolition) Act, 1970.",
    items: [
      "Principal employer registration",
      "Contractor license assistance",
      "Wage register and attendance maintenance",
      "Half-yearly return (Form V) filing",
      "Contract worker documentation",
    ],
  },
];

const acts = [
  "Employees' Provident Funds & Miscellaneous Provisions Act, 1952",
  "Employees' State Insurance Act, 1948",
  "Payment of Wages Act, 1936",
  "Minimum Wages Act, 1948",
  "Payment of Bonus Act, 1965",
  "Payment of Gratuity Act, 1972",
  "Maternity Benefit Act, 1961",
  "Equal Remuneration Act, 1976",
  "Industrial Disputes Act, 1947",
  "Contract Labour (Regulation & Abolition) Act, 1970",
  "Shops & Establishment Act (State-wise)",
  "Professional Tax Act (State-wise)",
  "Labour Welfare Fund Act (State-wise)",
  "Sexual Harassment of Women at Workplace Act, 2013",
];

export default function CompliancePage() {
  return (
    <div>
      <section className="bg-gradient-to-br from-blue-800 to-blue-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Statutory Compliance</h1>
          <p className="text-blue-100 max-w-2xl mx-auto text-lg">
            Stay 100% compliant with all Indian labor laws. We handle registrations, filings, and audits so you can focus on your business.
          </p>
        </div>
      </section>

      <section className="py-4 bg-amber-50 border-b border-amber-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 py-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800">
              <strong>Non-compliance can lead to heavy penalties, prosecution, and business disruption.</strong> Ensure your business meets all statutory requirements with our expert compliance services.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Compliance Areas We Cover</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              From PF and ESI to state-specific labor laws, we provide end-to-end compliance management.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {complianceAreas.map((area, i) => (
              <div
                key={i}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                    <area.icon className="h-6 w-6 text-blue-700" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900 mb-1">{area.title}</h3>
                    <p className="text-sm text-gray-600 mb-3">{area.desc}</p>
                    <ul className="space-y-1.5">
                      {area.items.map((item, j) => (
                        <li key={j} className="flex items-center gap-2 text-sm text-gray-700">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Acts & Regulations We Cover</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Our team of compliance experts ensures adherence to all applicable central and state labor laws.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-5xl mx-auto">
            {acts.map((act, i) => (
              <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-gray-50 border border-gray-100">
                <Scale className="h-4 w-4 text-blue-700 mt-0.5 shrink-0" />
                <span className="text-sm text-gray-700">{act}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-blue-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold mb-4">Ensure Your Business is Fully Compliant</h2>
          <p className="text-blue-100 mb-8 max-w-xl mx-auto">
            Get a free compliance audit from our experts. We'll identify gaps and create a roadmap to full compliance.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 bg-white text-blue-800 px-8 py-3 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
          >
            Request Compliance Audit <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
