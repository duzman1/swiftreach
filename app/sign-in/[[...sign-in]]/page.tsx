import Image from "next/image";
import Link from "next/link";
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
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
          Sign in to your account
        </p>
        <SignIn />
      </div>
    </div>
  );
}
