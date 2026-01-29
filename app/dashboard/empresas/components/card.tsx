type CardProps =
  | {
      title: string;
      value: number | string;
      subtitle?: string;
    }
  | {
      title: string;
      valueLeft: number | string;
      subtitleLeft: string;
      valueRight: number | string;
      subtitleRight: string;
    };

export default function Card(props: CardProps) {
  // ✅ Modo simples (não muda nada do seu layout atual)
  if ("value" in props) {
    const { title, value } = props;

    return (
      <main className="w-[336px] h-full bg-white rounded-xl shadow-xl p-4 flex flex-col justify-center">
        <span className="text-sm text-muted-foreground">{title}</span>

        <strong className="text-2xl md:text-2xl lg:text-2xl font-semibold leading-tight">
          {value}
        </strong>
      </main>
    );
  }

  // ✅ Modo duplo (mesma base visual, só divide em 2 colunas)
  const { title, valueLeft, subtitleLeft, valueRight, subtitleRight } = props;

  return (
    <main className="w-[336px] h-full bg-white rounded-xl shadow-xl p-6 flex flex-col justify-center">
      <span className="text-sm text-muted-foreground">{title}</span>

      <div className="mt-1 flex items-start justify-between">
        <div className="flex flex-col">
          <strong className="text-2xl md:text-2xl lg:text-2xl font-semibold leading-tight">
            {valueLeft}
          </strong>
          <span className="text-sm text-muted-foreground">
            {subtitleLeft}
          </span>
        </div>

        <div className="flex flex-col items-end text-right">
          <strong className="text-2xl md:text-2xl lg:text-2xl font-semibold leading-tight">
            {valueRight}
          </strong>
          <span className="text-sm text-muted-foreground">
            {subtitleRight}
          </span>
        </div>
      </div>
    </main>
  );
}
