export function QsaTab({
  qsas,
}: {
  qsas: { nome: string; qualificacao: string }[];
}) {
  if (!qsas.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum sócio cadastrado
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {qsas.map((qsa, i) => (
        <div
          key={i}
          className="border rounded-md px-3 py-2 flex justify-between"
        >
          <span>{qsa.nome}</span>
          <span className="text-sm text-muted-foreground">
            {qsa.qualificacao}
          </span>
        </div>
      ))}
    </div>
  );
}