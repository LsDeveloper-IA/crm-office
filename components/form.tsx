export default function Form() {
  return (
    <form>
        <div className="border-b border-gray-900/10 pb-12">
          <h2 className="text-base/7 font-semibold text-gray-900">Formulário</h2>
          
            <div className="mt-3 sm:col-span-3">
              <label htmlFor="cnpj" className="block text-sm/6 font-medium text-gray-900">
                CNPJ
              </label>
              <div className="mt-2">
                <input
                  id="cnpj"
                  name="cnpj"
                  type="text"
                  autoComplete="given-name"
                  className="block w-full rounded-md bg-white h-8 px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                />
              </div>
            </div>

            <div className="mt-3 sm:col-span-3">
              <label htmlFor="grupo-economico" className="block text-sm/6 font-medium text-gray-900">
                Grupo Econômico
              </label>
              <div className="mt-2">
                <input
                  id="grupo-economico"
                  name="grupo-economico"
                  type="text"
                  autoComplete="family-name"
                  className="block w-full rounded-md bg-white h-8 px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                />
              </div>
            </div>

            <div className="mt-3 sm:col-span-4">
              <label htmlFor="regime-tributario" className="block text-sm/6 font-medium text-gray-900">
                Regime Tributário
              </label>
              <select
                  id="regime-tributario"
                  name="regime-tributario"
                  autoComplete="country-name"
                  className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                >
                  <option>Isenta/Imune IR</option>
                  <option>MEI</option>
                  <option>Presumido</option>
                  <option>Real</option>
                  <option>Simples</option>
                  <option>Outros</option>
                </select>
            </div>

            <div className="mt-3 sm:col-span-3">
              <label htmlFor="contador" className="block text-sm/6 font-medium text-gray-900">
                Contador
              </label>
              <div className="mt-2 grid grid-cols-1">
                <select
                  id="contador"
                  name="contador"
                  autoComplete="country-name"
                  className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                >
                  <option>Orlando</option>
                  <option>Augusta</option>
                </select>
              </div>
            </div>

            <div className="mt-3 sm:col-span-3">
                <label htmlFor="setor-responsavel" className="block text-sm/6 font-medium text-gray-900">
                    Setor Responsável
                </label>
                <div className="mt-2 grid grid-cols-3">
                    <div className="flex items-center">
                        <label htmlFor="pessoal" className="text-sm font-medium text-gray-900">Pessoal</label>
                        <input type="checkbox" id="pessoal" className="ml-2 w-4 h-4"/>
                    </div>

                    <div className="flex items-center">
                        <label htmlFor="fiscal" className="text-sm font-medium text-gray-900">Fiscal</label>
                        <input type="checkbox" id="fiscal" className="ml-2 w-4 h-4"/>
                    </div>

                    <div className="flex items-center ">
                        <label htmlFor="contabil" className="text-sm font-medium text-gray-900">Contábil</label>
                        <input type="checkbox" id="contabil" className="ml-2 w-4 h-4"/>
                    </div>
                </div>
            </div>

            <div className="mt-3 sm:col-span-3">
                <input type="submit" value="Enviar" className="bg-gray-600 hover:bg-blue-600 text-white px-2 py-1 rounded-sm"/>
            </div>
          </div>
    </form>
  )
}