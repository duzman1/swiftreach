import Image from "next/image";
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4 py-10">
      <div className="w-full max-w-md flex flex-col items-center">
        <Link
          href="/"
          className="flex items-center mb-6 hover:opacity-80 transition-opacity"
          aria-label="SwiftReach home"
        >
          <Image
            src="/logo.png"
            alt="SwiftReach"
            width={180}
            height={50}
            className="object-contain"
            priority
          />
        </Link>
        <p className="text-sm text-muted-foreground mb-6">
          Create your free account
        </p>
        <SignUp />
        <p className="mt-6 text-xs text-muted-foreground text-center max-w-sm">
          By signing up, you agree to our{" "}
          <Link href="/terms" className="text-whatsapp hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-whatsapp hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
