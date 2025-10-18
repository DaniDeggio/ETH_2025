"use client";

import Link from "next/link";
import type { NextPage } from "next";
import { useMemo } from "react";
import { useAccount } from "wagmi";
import { CheckCircleIcon, LockClosedIcon, RocketLaunchIcon } from "@heroicons/react/24/outline";
import { Address } from "~~/components/scaffold-eth";

const Home: NextPage = () => {
  const { address, isConnected } = useAccount();

  const steps = useMemo(
    () => [
      {
        title: "1. Accedi con Civic",
        description:
          "Autenticati con il wallet Civic per creare una sessione sicura e cifrata.",
        icon: CheckCircleIcon,
      },
      {
        title: "2. Registra il debito",
        description:
          "Inserisci importo, scadenza e controparte: il contratto DebtRegistry cifra e memorizza i dati on-chain.",
        icon: LockClosedIcon,
      },
      {
        title: "3. Ripaga in privacy",
        description:
          "Invia rimborsi confidenziali con FHE: solo le parti coinvolte possono decifrare il saldo residuo.",
        icon: RocketLaunchIcon,
      },
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-base-100 via-base-200 to-base-300">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 pb-20 pt-16">
        <div className="grid gap-12 lg:grid-cols-[2fr,1fr] lg:items-center">
          <div className="space-y-6 text-left">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-4 py-1 text-sm font-semibold text-primary">
              Loan Management 3.0
            </span>
            <h1 className="text-4xl font-bold leading-tight md:text-5xl">
              Gestisci prestiti e debiti con privacy garantita da FHE
            </h1>
            <p className="text-lg text-base-content/80">
              DebtRegistry combina smart contract Ethereum e crittografia Fully Homomorphic per tenere traccia dei debiti,
              creare rimborsi protetti e verificare i saldi senza esporre le informazioni sensibili.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/debtregistry"
                className="rounded-md bg-primary px-6 py-3 text-base font-semibold text-primary-content shadow-lg transition hover:scale-105 hover:bg-primary-focus"
              >
                Apri il Debt Registry
              </Link>
              <Link
                href="/debug"
                className="rounded-md border border-primary px-6 py-3 text-base font-semibold text-primary transition hover:scale-105 hover:bg-primary/10"
              >
                Esplora lo smart contract
              </Link>
            </div>
          </div>
          <div className="rounded-3xl border border-base-300 bg-base-100 p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-base-content">Stato connessione</h2>
            <p className="mt-3 text-sm text-base-content/70">
              Accedi con Civic e collega il wallet supportato per iniziare a registrare i tuoi debiti.
            </p>
            <div className="mt-6 rounded-xl border border-dashed border-base-200 bg-base-200/60 p-4 text-sm">
              <span className="font-medium text-base-content/70">Wallet collegato:</span>
              <div className="mt-2">
                <Address address={isConnected ? address : undefined} />
              </div>
            </div>
            <p className="mt-6 text-xs text-base-content/60">
              Il wallet Civic fornisce l&apos;identità verificata: le interazioni con DebtRegistry richiedono una sessione attiva.
            </p>
          </div>
        </div>

        <section className="grid gap-6 rounded-3xl bg-base-100 p-10 shadow-xl lg:grid-cols-3">
          {steps.map(step => (
            <article key={step.title} className="flex flex-col gap-4 rounded-2xl border border-base-200 p-6">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <step.icon className="h-6 w-6" />
              </span>
              <h3 className="text-xl font-semibold text-base-content">{step.title}</h3>
              <p className="text-sm text-base-content/70">{step.description}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-3xl border border-base-200 bg-base-100 p-8 shadow-lg">
            <h3 className="text-2xl font-semibold text-base-content">Cosa puoi fare</h3>
            <ul className="mt-4 space-y-3 text-base text-base-content/80">
              <li>
                • Dichiarare un debito verso un qualsiasi address Ethereum in modo verificabile e cifrato.
              </li>
              <li>
                • Condividere solo con le controparti autorizzate il saldo residuo grazie alla decifrazione FHE.
              </li>
              <li>
                • Aggiornare il debito con rimborsi parziali mantenendo la privacy sul valore effettivo.
              </li>
            </ul>
          </div>
          <div className="rounded-3xl border border-base-200 bg-base-100 p-8 shadow-lg">
            <h3 className="text-2xl font-semibold text-base-content">Perché Civic + FHE</h3>
            <p className="mt-4 text-base text-base-content/80">
              Civic autentica l&apos;identità dell&apos;utente e garantisce sessioni affidabili. La componente Fully Homomorphic Encryption
              delinea un flusso in cui il contratto smart elabora importi cifrati, impedendo a terzi di leggere i dati sensibili.
            </p>
            <p className="mt-4 text-sm text-base-content/60">
              Una volta dentro il Debt Registry puoi cifrare gli importi, inviare pagamenti e decifrare il saldo residuo solo quando necessario.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-base-200 bg-base-100 p-10 shadow-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-base-content">Pronto a iniziare?</h3>
              <p className="mt-2 text-base text-base-content/70">
                Accedi, collega il wallet Civic e visita il Debt Registry per registrare il primo debito cifrato.
              </p>
            </div>
            <Link
              href="/debtregistry"
              className="rounded-md bg-secondary px-6 py-3 text-base font-semibold text-secondary-content shadow-lg transition hover:scale-105 hover:bg-secondary-focus"
            >
              Vai al Debt Registry
            </Link>
          </div>
        </section>
      </section>
    </div>
  );
};

export default Home;
