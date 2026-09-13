interface PageStubProps {
  title: string;
  description: string;
}

/** Placeholder card for pages owned by later F-waves. */
export function PageStub({ title, description }: PageStubProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </section>
  );
}
