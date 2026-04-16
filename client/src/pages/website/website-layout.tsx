import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, Building2, Phone, Mail, MapPin, Facebook, Linkedin, Twitter, Instagram } from "lucide-react";

const navLinks = [
  { label: "Home", path: "/", },
  { label: "Services", path: "/services" },
  { label: "Compliance", path: "/compliance" },
  { label: "Our Directors", path: "/directors" },
  { label: "Contact Us", path: "/contact" },
];

function Navbar() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();

  return (
    <nav className="bg-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center gap-2">
            <Building2 className="h-8 w-8 text-blue-700" />
            <div className="leading-tight">
              <span className="text-lg font-bold text-blue-800 block">TBJ VISION CONNECT</span>
              <span className="text-[10px] text-gray-500 tracking-widest">PVT. LTD.</span>
            </div>
          </Link>
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                href={link.path}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location === link.path
                    ? "bg-blue-700 text-white"
                    : "text-gray-700 hover:bg-blue-50 hover:text-blue-700"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/login"
              className="ml-3 px-5 py-2 bg-blue-700 text-white rounded-md text-sm font-semibold hover:bg-blue-800 transition-colors"
            >
              ERP Login
            </Link>
          </div>
          <button
            className="md:hidden p-2 rounded-md text-gray-700 hover:bg-gray-100"
            onClick={() => setOpen(!open)}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="md:hidden border-t bg-white">
          <div className="px-2 pt-2 pb-3 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                href={link.path}
                onClick={() => setOpen(false)}
                className={`block px-3 py-2 rounded-md text-base font-medium ${
                  location === link.path
                    ? "bg-blue-700 text-white"
                    : "text-gray-700 hover:bg-blue-50"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 rounded-md text-base font-semibold bg-blue-700 text-white text-center"
            >
              ERP Login
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}

function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="h-8 w-8 text-blue-400" />
              <div className="leading-tight">
                <span className="text-lg font-bold text-white block">TBJ VISION CONNECT</span>
                <span className="text-[10px] text-gray-400 tracking-widest">PVT. LTD.</span>
              </div>
            </div>
            <p className="text-sm text-gray-400">
              Empowering businesses with comprehensive HR solutions, payroll management, and statutory compliance services across India.
            </p>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              {navLinks.map((link) => (
                <li key={link.path}>
                  <Link href={link.path} className="hover:text-blue-400 transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/login" className="hover:text-blue-400 transition-colors">
                  ERP Login
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-4">Our Services</h3>
            <ul className="space-y-2 text-sm">
              <li>HR Management</li>
              <li>Payroll Processing</li>
              <li>Statutory Compliance</li>
              <li>Manpower Supply</li>
              <li>Attendance Management</li>
              <li>Recruitment Solutions</li>
            </ul>
          </div>
          <div>
            <h3 className="text-white font-semibold mb-4">Contact Info</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 text-blue-400 shrink-0" />
                <span>India</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-blue-400 shrink-0" />
                <span>+91 99990 87409</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-blue-400 shrink-0" />
                <span>info@tbjvisionconnect.com</span>
              </li>
            </ul>
            <div className="flex gap-3 mt-4">
              <a href="#" className="p-2 bg-gray-800 rounded-full hover:bg-blue-700 transition-colors">
                <Facebook className="h-4 w-4" />
              </a>
              <a href="#" className="p-2 bg-gray-800 rounded-full hover:bg-blue-700 transition-colors">
                <Linkedin className="h-4 w-4" />
              </a>
              <a href="#" className="p-2 bg-gray-800 rounded-full hover:bg-blue-700 transition-colors">
                <Twitter className="h-4 w-4" />
              </a>
              <a href="#" className="p-2 bg-gray-800 rounded-full hover:bg-blue-700 transition-colors">
                <Instagram className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm text-gray-500">
          <p>&copy; {new Date().getFullYear()} TBJ VISION CONNECT PVT. LTD. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

export default function WebsiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
