type CardProps = {
  title: string;
  value: number | string;
};

export default function Card({ title, value }: CardProps) {
  return (
    <main className="w-[336px] h-full bg-white rounded-xl shadow-xl p-4 flex flex-col justify-center">
      <span className="text-sm text-muted-foreground">{title}</span>

      <strong className="text-2xl md:text-2xl lg:text-2xl font-semibold leading-tight">
        {value}
      </strong>
    </main>
  );
}