type ModalProps = {
    isOpen: boolean;
    onClose: () => void;
}

export function CompaniesSheetsContent({ isOpen, onClose }: ModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={onClose}/>

            <div className="relative w-[500px] h-[350px] bg-white rounded-md shadow-lg flex flex-col">
                {/* Header */}
                <div className="px-6 pt-5">
                    <h2 className="text-lg font-semibold text-gray-800">
                    Informações da Planilha
                    </h2>

                    <div className="mt-2 h-px w-[95%] bg-gray-200" />
                </div>

                {/* Conteúdo */}
                <div className="flex-1 px-6 py-4">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    {/* Campo */}
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                        Email
                    </label>

                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                        Nome
                    </label>

                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                        Telefone
                    </label>

                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                        Data de Criação
                    </label>
                    </div>
                </div>
            </div>
        </div>
    );
}