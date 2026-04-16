import { Link } from "wouter";
import { User, Linkedin, Mail, ArrowRight, Award, Target, Eye } from "lucide-react";

const directors = [
  {
    name: "Neeraj Sengar",
    designation: "Director",
    bio: "A visionary leader with extensive experience in HR consulting and business management. Drives the company's strategic direction and growth initiatives across India.",
    expertise: ["Strategic Planning", "Business Development", "HR Consulting", "Client Relations"],
  },
  {
    name: "Arunesh Kumar Mishra",
    designation: "Director",
    bio: "Brings deep operational expertise in payroll processing, statutory compliance, and HR service delivery. Ensures excellence in day-to-day operations and service quality.",
    expertise: ["Operations Management", "Payroll Processing", "Compliance Management", "Process Optimization"],
  },
];

const values = [
  {
    icon: Award,
    title: "Excellence",
    desc: "We strive for the highest standards in every service we deliver, ensuring quality and accuracy.",
  },
  {
    icon: Target,
    title: "Integrity",
    desc: "We conduct business with transparency, honesty, and ethical practices at every level.",
  },
  {
    icon: Eye,
    title: "Innovation",
    desc: "We leverage technology and modern practices to deliver efficient and scalable solutions.",
  },
];

export default function DirectorsPage() {
  return (
    <div>
      <section className="bg-gradient-to-br from-blue-800 to-blue-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Our Directors</h1>
          <p className="text-blue-100 max-w-2xl mx-auto text-lg">
            Meet the leadership team driving TBJ Vision Connect's mission to transform HR management across India.
          </p>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Leadership Team</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Our directors bring decades of combined experience in HR management, compliance, and business operations.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {directors.map((director, i) => (
              <div
                key={i}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow group"
              >
                <div className="h-48 bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center">
                  <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                    <User className="h-12 w-12 text-blue-700" />
                  </div>
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-bold text-gray-900 text-center">{director.name}</h3>
                  <p className="text-blue-700 font-medium text-center text-sm mb-4">{director.designation}</p>
                  <p className="text-gray-600 text-sm mb-4 leading-relaxed">{director.bio}</p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {director.expertise.map((skill, j) => (
                      <span
                        key={j}
                        className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs rounded-full font-medium"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                  <div className="flex justify-center gap-3 pt-4 border-t border-gray-100">
                    <a href="#" className="p-2 bg-gray-100 rounded-full hover:bg-blue-100 transition-colors">
                      <Linkedin className="h-4 w-4 text-gray-600" />
                    </a>
                    <a href="#" className="p-2 bg-gray-100 rounded-full hover:bg-blue-100 transition-colors">
                      <Mail className="h-4 w-4 text-gray-600" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Our Vision & Values</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-12">
            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100">
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Eye className="h-5 w-5 text-blue-700" />
                Our Vision
              </h3>
              <p className="text-gray-600 leading-relaxed">
                To be India's most trusted HR solutions partner, empowering businesses of all sizes with technology-driven, compliant, and efficient workforce management services.
              </p>
            </div>
            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100">
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Target className="h-5 w-5 text-blue-700" />
                Our Mission
              </h3>
              <p className="text-gray-600 leading-relaxed">
                To deliver exceptional HR, payroll, and compliance services that simplify workforce management, ensure 100% statutory compliance, and enable our clients to focus on their core business.
              </p>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {values.map((value, i) => (
              <div key={i} className="bg-white rounded-xl p-6 text-center shadow-sm border border-gray-100">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <value.icon className="h-6 w-6 text-blue-700" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{value.title}</h3>
                <p className="text-gray-600 text-sm">{value.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-blue-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold mb-4">Want to Work With Us?</h2>
          <p className="text-blue-100 mb-8 max-w-xl mx-auto">
            Get in touch with our leadership team to discuss how we can help your business grow.
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
