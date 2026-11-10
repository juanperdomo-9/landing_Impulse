import Link from "next/link";
import { config, formatPrice } from "@/lib/config";

const FEATURES = [
  { icon: "💬", title: "Edita hablando", text: "Escribe lo que quieres — “pon subtítulos estilo TikTok y quita los silencios” — y la IA lo hace." },
  { icon: "🔤", title: "Subtítulos automáticos", text: "Transcripción con IA directamente en tu navegador, con estilos animados palabra por palabra." },
  { icon: "✂️", title: "Cortes inteligentes", text: "Elimina pausas, muletillas y errores, o pide un resumen con los mejores momentos." },
  { icon: "🖼️", title: "Fotos y textos", text: "Superpón imágenes, títulos, etiquetas y llamadas a la acción con animaciones." },
  { icon: "🔊", title: "Música y sonidos", text: "Música de fondo con fundidos y efectos de sonido integrados: whoosh, pop, boom…" },
  { icon: "✨", title: "Efectos visuales", text: "Zoom, temblor, glitch, flash, blanco y negro, vintage, barras de cine y más." },
];

export default function Home() {
  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2 text-lg font-extrabold">
          <span className="grad grid h-8 w-8 place-items-center rounded-lg text-white">▶</span>
          Impulsa <span className="grad-text">Studio</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/login" className="btn">
            Ingresar
          </Link>
          <Link href="#precio" className="btn btn-primary">
            Ver precio
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-4 pt-16 pb-12 text-center">
        <p className="mb-4 inline-block rounded-full border border-[var(--line)] px-3 py-1 text-xs text-[var(--muted)]">
          Editor de video con inteligencia artificial
        </p>
        <h1 className="text-4xl leading-tight font-black sm:text-6xl">
          Sube tu video en crudo.
          <br />
          <span className="grad-text">Dile lo que quieres.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-[var(--muted)]">
          Subtítulos, cortes, fotos, música, efectos de sonido y efectos visuales — todo con instrucciones en
          lenguaje natural. Listo para Reels, TikTok, Shorts y YouTube.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/login?next=/editor" className="btn btn-primary px-6 py-3 text-base">
            Probar gratis {config.trialDays} días
          </Link>
        </div>
        <p className="mt-4 text-xs text-[var(--muted)]">
          Sin tarjeta para empezar. Tus videos se procesan en tu navegador: no se suben a ningún servidor.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-10">
        <div className="panel rounded-2xl p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1 rounded-xl bg-[#0f0f18] px-4 py-3 text-left text-sm text-[var(--muted)]">
              <span className="text-[var(--text)]">Tú:</span> “Hazlo vertical para TikTok, quita los silencios, pon
              subtítulos amarillos, mi logo al inicio y un whoosh en cada corte”
            </div>
            <span className="text-center text-2xl">→</span>
            <div className="grad flex-1 rounded-xl px-4 py-3 text-left text-sm text-white">
              ✓ Formato 9:16 · ✓ 23 cortes · ✓ 41 subtítulos · ✓ Logo animado · ✓ Efectos de sonido
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-24 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="panel rounded-2xl p-5">
            <div className="text-2xl">{f.icon}</div>
            <h3 className="mt-3 font-bold">{f.title}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">{f.text}</p>
          </div>
        ))}
      </section>

      <section id="precio" className="mx-auto max-w-md px-4 pb-24">
        <div className="panel rounded-2xl p-6 text-center">
          <div className="label">Plan mensual</div>
          <div className="mt-2 text-4xl font-black">
            {formatPrice()}
            <span className="text-base font-semibold text-[var(--muted)]"> / mes</span>
          </div>
          <ul className="mt-5 space-y-2 text-left text-sm">
            <li>✓ Editor completo: cortes, textos, fotos, música, sonidos y efectos</li>
            <li>✓ Subtítulos automáticos ilimitados</li>
            <li>✓ {config.aiMonthlyLimit} créditos de IA por mes (1 crédito = 1 pedido al asistente)</li>
            <li>✓ Exporta en vertical, cuadrado u horizontal</li>
            <li>✓ Cancela cuando quieras desde Mercado Pago</li>
          </ul>
          <Link href="/login?next=/editor" className="btn btn-primary mt-6 w-full justify-center py-3 text-base">
            Empezar prueba gratis de {config.trialDays} días
          </Link>
          <p className="mt-2 text-xs text-[var(--muted)]">Después, {formatPrice()}/mes. Cancelas cuando quieras.</p>
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-[var(--line)] py-6 text-center text-xs text-[var(--muted)]">
        <span>Impulsa Studio Digital</span>
        <Link href="/cuenta#baja" className="font-bold text-[var(--text)] underline underline-offset-2">
          Botón de baja
        </Link>
      </footer>
    </main>
  );
}
