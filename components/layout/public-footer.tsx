import Link from "next/link"
import { Mail, Phone, MapPin, Linkedin, Instagram, Facebook, MessageCircle } from "lucide-react"


const footerLinks = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "Solutions", href: "/solutions" },
      { label: "Pricing", href: "/pricing" },
      { label: "FAQ", href: "/faq" },
      { label: "Blog", href: "/blog" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About us", href: "/about" },
      { label: "Partners", href: "/solutions" },
      { label: "Careers (coming soon)", href: "#" },
      { label: "Contact", href: "/contact" },
    ],
  },
]

export function PublicFooter() {
  return (
    <footer className="mt-24 bg-slate-950 text-slate-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid gap-10 lg:grid-cols-4">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-[#7C3AED] via-[#8B5CF6] to-[#A855F7] text-white font-bold text-xl flex items-center justify-center">
                E
              </div>
              <div>
                <p className="font-semibold text-white">Ease My Salon</p>
                <p className="text-xs text-slate-400">Salon OS for India</p>
              </div>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">From POS to payroll, Ease My Salon powers every workflow so you can focus on exceptional client experiences. Trusted by 350+ salons across India.</p>
            
            {/* Trust Badges */}
            <div className="pt-4 space-y-3">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>98% Customer Satisfaction</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>24/7 Support Available</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Setup in 1 Day</span>
              </div>
            </div>
            
          </div>
          {footerLinks.map((section) => (
            <div key={section.title}>
              <p className="text-sm font-semibold tracking-wide text-white uppercase">{section.title}</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-400">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="hover:text-white transition">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <p className="text-sm font-semibold tracking-wide text-white uppercase">Contact</p>
            <ul className="mt-4 space-y-3 text-sm text-slate-400">
              <li className="flex items-start gap-3">
                <Mail className="h-4 w-4 mt-1 text-white" />
                <a href="mailto:hello@easemysalon.in" className="hover:text-white transition">
                  hello@easemysalon.in
                </a>
              </li>
              <li className="flex items-start gap-3">
                <Phone className="h-4 w-4 mt-1 text-white" />
                <a href="tel:+917091140602" className="hover:text-white transition">
                  +91 70911 40602
                </a>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="h-4 w-4 mt-1 text-white" />
                <p>Operating across India. Crafted with love in Bengaluru.</p>
              </li>
            </ul>
            <div className="flex gap-3 text-slate-400 pt-4">
              {[Linkedin, Instagram, Facebook, MessageCircle].map((Icon, idx) => (
                <button key={idx} className="h-10 w-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/10 hover:border-white/20 transition-all transform hover:scale-110">
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-12 border-t border-white/10 pt-6 flex flex-col md:flex-row gap-4 justify-between text-xs text-slate-500">
          <p>© {new Date().getFullYear()} Ease My Salon. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/privacy-policy" className="hover:text-white transition">
              Privacy
            </Link>
            <Link href="/faq" className="hover:text-white transition">
              Support
            </Link>
            <Link href="/contact" className="hover:text-white transition">
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

