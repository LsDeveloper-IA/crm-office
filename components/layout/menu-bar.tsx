import Image from "next/image";
export function MenuBar() {
  return (
    <div className="flex flex-col h-full w-20 items-center gap-5 pt-7 ">
      <Image src="/logos/logo.svg" alt="" width={30} height={30} />
      <div className="w-20 h-16 flex justify-center py-2 px-4">
        <Image src="/icons/home.svg" alt="" width={24} height={24} />
      </div>
    </div>
  )
}