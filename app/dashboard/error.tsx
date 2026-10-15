"use client";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void; }) {
  return (
    <div>
      <h2>Algo deu errado no painel.</h2>
      <button type="button" onClick={() => reset()}>Tentar novamente</button>
    </div>
  );
}
