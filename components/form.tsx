import { PatternFormat } from "react-number-format";
import { validateCNPJ } from "@/lib/cnpj";
import { useState } from "react";


export default function Form() {
  const [valueTyped, setCnpj] = useState('');
  const [erro, setErro] = useState('');
  const [disabled, setDisabled] = useState(false);
  
  // A função faz a verificação do CNPJ e atualiza o estado conforme o valor digitado
  const handleCnpjChange = (e: { target: { value: any; }; preventDefault: () => void; }) => {
    const valueTyped = e.target.value;

    const isValid = validateCNPJ(valueTyped);

    setCnpj(valueTyped);

    e.preventDefault(); 
    setErro('');
    
    // Se o CNPJ não for válido, define uma mensagem de erro. Ela será exibida para o usuário.
    if (!isValid) {
      setErro('O CNPJ digitado é inválido. Verifique os números.');
      setDisabled(true);
      return;
    }

    else {
      setDisabled(false);
      setErro('');
      return;
    }
  };

  return (
    <form>
        <div className="border-b border-gray-900/10 pb-12">
          <h2 className="text-base/7 font-semibold text-gray-900">Formulário</h2>
          
            <div className="mt-3 sm:col-span-3">
              <label htmlFor="cnpj" className="block text-sm/6 font-medium text-gray-900">
                CNPJ
              </label>
              <div className="mt-2">
                <PatternFormat
                  id="cnpj"
                  name="cnpj"
                  format="##.###.###/####-##"
                  mask="_"
                  placeholder="00.000.000/0000-00"
                  className="block w-full rounded-md bg-white h-8 px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                  value={valueTyped}
                  onChange={handleCnpjChange}

                  />
                  {erro && (<p className="text-red-500 text-[13px] mt-1">{erro}</p>)}
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
                <label htmlFor="certificate" className="block text-sm/6 font-medium text-gray-900">
                    Certificado
                </label>
                <div className="mt-2 grid grid-cols-1">
                <select
                  id="contador"
                  name="contador"
                  autoComplete="country-name"
                  className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                >
                  <option>Sim</option>
                  <option>Não</option>
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
                        <input type="checkbox" id="contabil" className="ml-2 w-4 h-4 bg-green-500"/>
                    </div>
                </div>
            </div>

            <div className="mt-3 sm:col-span-3">
                <input type="submit" value="Enviar" className={`bg-gray-600 text-white px-2 py-1 rounded-sm transition ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-600'}`} disabled={disabled}/>
            </div>
          </div>
    </form>
  )
}