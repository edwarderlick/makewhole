export function PageHero({
  kicker,
  title,
  lede,
}: {
  kicker: string;
  title: string;
  lede?: string;
}) {
  return (
    <div className="mb-10">
      <div className="inline-flex items-center space-x-2 text-xs font-mono font-semibold text-lime-700 bg-lime-50 px-3 py-1 border border-lime-300 rounded">
        {kicker}
      </div>
      <h1 className="mt-3 font-headline-xl text-headline-xl text-primary tracking-tight">{title}</h1>
      {lede ? <p className="mt-3 font-body-lg text-body-lg text-on-surface-variant max-w-2xl">{lede}</p> : null}
    </div>
  );
}
