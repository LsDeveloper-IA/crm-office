// scripts/test-new-user.ts
import 'dotenv/config'

import prisma from '@/lib/prisma'
import { POST } from '@/app/api/newUser/route'

async function run() {
  console.log('🚀 Iniciando teste da rota /api/newUser')

  // 📌 Dados que serão enviados para a API
  const newUserData = {
    name: 'user',
    username: 'user@gmail.com',
    password: 'senha@123',
    role: 'USER',
    active: true,
  }

  console.log('📤 Dados enviados para a API:', newUserData)

  // 📡 Simulando uma requisição HTTP
  const req = new Request('http://localhost/api/newUser', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(newUserData),
  }) as any

  // 🔥 Chamando diretamente a função da rota
  const res = await POST(req)

  console.log('📡 Status HTTP:', res.status)
  console.log('📦 Response da API:', await res.json())

  // 🗄️ Buscando no banco o MESMO usuário enviado
  const user = await prisma.user.findUnique({
    where: { username: newUserData.username },
  })

  console.log('🗄️ Usuário no banco:', user)

  if (!user) {
    throw new Error('❌ Usuário NÃO foi criado')
  }

  console.log('✅ Teste finalizado com sucesso')
  process.exit(0)
}

run().catch((err) => {
  console.error('💥 Teste falhou:', err)
  process.exit(1)
})
