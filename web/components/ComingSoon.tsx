export default function ComingSoon({ title }: { title: string }) {
  return (
    <div className="grid h-full place-items-center bg-app p-6 text-center">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-muted">This section is built in a later step.</p>
      </div>
    </div>
  );
}
