export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4">
      <section className="min-h-[70vh] flex flex-col items-center justify-center text-center">
        <h1 className="text-4xl md:text-6xl font-semibold tracking-tight">
          Global Navigation
        </h1>
        <p className="mt-4 text-lg text-neutral-600">
          Front-Page — Maybe picture or the business name, colorful and creative.
        </p>
      </section>

      <div className="py-10 text-center text-neutral-500">
        <img
          src="/Logo.png"
          alt="Kumo Consulting Logo"
          className="mx-auto h-20 w-auto"
        />
      </div>
    </main>
  );
}
