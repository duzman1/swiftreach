import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { MessageCircle } from "lucide-react";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4 py-10">
      <div className="w-full max-w-md flex flex-col items-center">
        <Link
          href="/"
          className="flex items-center gap-2 mb-6 text-zinc-700 hover:text-foreground"
        >
          <div className="bg-whatsapp rounded-lg p-2">
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tight">SwiftReach</span>
        </Link>
        <p className="text-sm text-muted-foreground mb-6">
          Create your free account
        </p>
        <SignUp />
      </div>
    </div>
  );
}
