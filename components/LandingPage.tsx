import Image from "next/image";
import Link from "next/link";
import {
  FileSpreadsheet,
  Variable,
  LineChart,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <header className="px-6 md:px-10 py-5 flex items-center justify-between max-w-6xl mx-auto w-full">
        <Link href="/" className="flex items-center" aria-label="SwiftReach home">
          <Image
            src="/logo.png"
            alt="SwiftReach"
            width={140}
            height={40}
            className="object-contain"
            priority
          />
        </Link>
        <Link href="/sign-in">
          <Button variant="ghost" size="sm">
            Sign In
          </Button>
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 max-w-3xl mx-auto w-full text-center py-12">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
          WhatsApp Business marketing for small businesses.
        </h1>
        <p className="text-lg text-muted-foreground mb-8 max-w-2xl">
          Create, send, and track compliant WhatsApp Business campaigns to
          opted-in customers. Personalize every message, build reusable
          templates, and monitor delivery in real time.
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Link href="/sign-up">
            <Button size="lg" className="w-full sm:w-auto bg-whatsapp hover:bg-whatsapp-dark text-white">
              Get Started Free →
            </Button>
          </Link>
          <Link href="/sign-in">
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              Sign In
            </Button>
          </Link>
        </div>
      </main>

      <section className="px-6 py-16 bg-background border-t">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          <Feature
            icon={<FileSpreadsheet className="w-6 h-6" />}
            title="Bring your own customer list"
            description="Excel, CSV, or directly from Google Drive. Column headers become campaign variables — no schema config required."
          />
          <Feature
            icon={<Variable className="w-6 h-6" />}
            title="Personalize every campaign"
            description="Drop your file's columns into a reusable template. Each opted-in customer gets a message that's actually about them."
          />
          <Feature
            icon={<LineChart className="w-6 h-6" />}
            title="Track delivery in real time"
            description="See sends, deliveries, reads, and failures live. Pause, resume, or retry failed contacts at any moment."
          />
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
            Ready to message your opted-in customers on WhatsApp?
          </h2>
          <p className="text-muted-foreground mb-6">
            Free to start. No credit card required.
          </p>
          <Link href="/sign-up">
            <Button size="lg" className="bg-whatsapp hover:bg-whatsapp-dark text-white">
              Create Your Free Account
            </Button>
          </Link>
        </div>
      </section>

      <footer className="px-6 md:px-10 py-4 text-xs text-muted-foreground border-t bg-background">
        <div className="max-w-6xl mx-auto w-full flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>SwiftReach · swiftreach.app</div>
          <nav className="flex items-center gap-3">
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <span className="text-zinc-300">·</span>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms of Service
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

// Default export so `import LandingPage from "@/components/LandingPage"`
// resolves in app/page.tsx. The named export above is kept for any
// existing call sites.
export default LandingPage;

function Feature({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center md:text-left">
      <div className="inline-flex bg-whatsapp/10 text-whatsapp rounded-md p-2.5 mb-3">
        {icon}
      </div>
      <h3 className="font-semibold mb-1.5">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
