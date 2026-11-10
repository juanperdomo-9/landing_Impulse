import BrandLogo from "@/components/BrandLogo";
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
        <div className="mb-8 flex justify-center">
          <BrandLogo />
        </div>
        <div className="panel rounded-2xl p-6">
          <LoginForm next={safeNext} linkError={!!error} />
        </div>
      </div>
    </main>
  );
}
