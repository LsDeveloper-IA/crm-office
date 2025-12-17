'use client';

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import Form from "./form"

// Um componente simples de backdrop (fundo escuro)
const Backdrop = ({ onClose }: any) => (
  <div
    className='fixed top-0 left-0 w-full h-full bg-black/25 z-10 flex justify-center items-center'
    onClick={onClose} // Fecha o modal ao clicar no backdrop
  />
);

export default function ModalForm({ isOpen, onClose, imageUrl }: any) {
  const [mounted, setMounted] = useState(false);

  // Garante que o modal só tente se renderizar no lado do cliente
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <>
      <Backdrop onClose={onClose}/>
        <div
            className='fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white p-5 w-[35%] h-[92%] shadow-sm rounded-md border z-20'
            // Previne que o clique no conteúdo feche o modal
            onClick={(e) => e.stopPropagation()} 
        >

            <button 
            onClick={onClose}
            className='absolute top-1 right-2'
            >
            &times;
            </button>
            <Form></Form>
            {/* <h1 className='mb-2 font-bold text-xl'>Formulário</h1>
            <div>
                <label htmlFor="cnpj" className='mb-4 font-medium text-base'>cnpj</label>
                <input type="text" id="cnpj" className='w-full h-8 rounded-sm border border-gray-400 p-2'/>
            </div>
            <div>
                <label htmlFor=""></label>
            </div> */}
        </div>
    </>,
    document.body // Onde o modal será injetado no DOM
  );
}