import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccount } from "@/lib/account";
import { accountsEnabled } from "@/lib/config";
import LoginForm from "./LoginForm";

export const metadata = { title: "Ingresar — Impulsa Studio" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/editor";
  if (!accountsEnabled()) redirect(safeNext);
  if (await getAccount()) redirect(safeNext);

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 text-lg font-extrabold">
          <span className="grad grid h-8 w-8 place-items-center rounded-lg text-white">▶</span>
          Impulsa <span className="grad-text">Studio</span>
        </Link>
        <div className="panel rounded-2xl p-6">
          <LoginForm next={safeNext} linkError={!!error} />
        </div>
      </div>
    </main>
  );
}
