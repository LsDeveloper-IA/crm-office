# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Install dependencies: `pnpm install`
- Start the Next.js dev server: `pnpm dev`
- Build for production: `pnpm build`
- Start the production server: `pnpm start`
- Run ESLint: `pnpm lint`
- Generate the Prisma client: `pnpm prisma:generate`
- Create/apply a development migration: `pnpm prisma:migrate`
- Seed the database: `pnpm prisma:seed`
- Run the bulk Receita sync script: `pnpm tsx scripts/companies/updateCompaniesReceita.ts`

There is currently no automated `test` script in `package.json`.

## Architecture overview

- This is a Next.js 16 App Router app with React 19, TypeScript `strict`, Tailwind CSS v4, and shadcn/ui-style components. Path aliases use `@/*` from the repo root.
- The public entry point is the login page at `app/page.tsx`. The authenticated application lives under `app/dashboard/**` and is wrapped by `app/dashboard/layout.tsx`, which loads the current user server-side before rendering the shared shell in `components/layout/dashboard-shell.tsx`.
- Route protection happens in two layers:
  - `middleware.ts` only checks whether the `token` cookie exists for configured protected paths.
  - `lib/auth.ts` is the real auth gate: it verifies the JWT, loads the user from Prisma, and is used by server pages and API routes.
- Authentication is JWT + httpOnly cookie based. Login is handled by `app/api/auth/login/route.ts`; logout/me endpoints live alongside it in `app/api/auth/**`.

## Data model and backend flow

- Prisma is the main data layer. `lib/prisma.ts` creates a singleton Prisma client using `@prisma/adapter-pg`, and `prisma/schema.prisma` defines the full CRM domain.
- The core entity is `Company`, keyed by normalized 14-digit CNPJ. CRM-specific fields that are not part of Receita data live mostly in `CompanyProfile` (tax regime, accountant, fees, extra system billing, economic group, thirteenth flag).
- Related company data is split into dedicated tables: QSA partners, CNAE activities, sectors, sector owners, systems, contacts, notes, attachments, certificates, and profit distributions.
- Important schema nuance: `CompanySector.ownerName` is marked as legacy and is still actively preserved by the API even though the newer multi-owner model uses `CompanySectorOwner`. When changing sector-owner behavior, keep both representations in mind.

## Feature structure

- `app/dashboard/empresas/**` is the main company-management feature. The page fetches paginated/sorted company data directly from Prisma, then maps it through DTOs in `app/dashboard/empresas/dto/**` before rendering tables, drawers, tabs, and edit forms.
- Client-side state for company editing/detail loading is localized under `app/dashboard/empresas/hooks/**`.
- The settings area is under `app/dashboard/settings/**`; `usuarios` is admin-only and reads directly from Prisma.
- Profit distribution management is its own dashboard section under `app/dashboard/distribuicao-lucros/**` and backend routes under `app/api/profit-distributions/**`.

## API and integrations

- Most backend behavior lives in App Router route handlers under `app/api/**`. These handlers usually talk directly to Prisma or to small domain helpers in `lib/company/**` and `lib/receita/**`.
- `app/api/company/[cnpj]/route.ts` is the main read/update endpoint for company details and company profile data.
- `app/api/companies/route.ts` handles company search and manual creation; CNPJ normalization/validation is centralized in `lib/cnpj.ts`.
- `app/api/sheets/route.ts` exports filtered company data to Excel using ExcelJS. Its sorting/filtering rules mirror the companies dashboard page, so changes to list behavior often need to be reflected in both places.
- ReceitaWS integration is centralized in `lib/receita/receita.client.ts` and `lib/receita/receita.mapper.ts`. `lib/company/company.create.ts` and `lib/company/company.refresh.ts` use those helpers to create or refresh company records from Receita data.
- `scripts/companies/updateCompaniesReceita.ts` is a long-running bulk sync script with checkpoint/error-log files under `scripts/`; use it for batch refreshes instead of re-implementing ad hoc sync logic.
- Email notifications go through Resend in `lib/email.ts`. Profit distribution updates send email when a record changes into a closed status.
- `app/api/company/refresh/route.ts` currently returns a stub `{ ok: true }`; the real refresh logic exists in `lib/company/company.refresh.ts`.

## Working conventions derived from the code

- Runtime-facing text, variable names, and domain concepts are mostly in Portuguese and tied to Brazilian accounting workflows (CNPJ, QSA, CNAE, regime tributário, honorários, décimo terceiro). Match that vocabulary when extending existing flows.
- Server-rendered dashboard pages often query Prisma directly instead of going through internal API calls. Before adding a new API abstraction, check whether the surrounding feature already follows the direct-Prisma server component pattern.
- Several pages and handlers rely on Node.js runtime behavior (`runtime = "nodejs"`) because they use Prisma, JWT, or server-only integrations. Preserve that when moving logic across boundaries.