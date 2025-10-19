"use client";

import Link from "next/link";
import type { NextPage } from "next";
import { useMemo } from "react";
import { CheckCircleIcon, LockClosedIcon, RocketLaunchIcon } from "@heroicons/react/24/outline";


const Home: NextPage = () => {

  const steps = useMemo(
    () => [
      {
        title: "1. Accedi con Civic",
        description:
          "Autenticati con Civic per un accesso rapido e sicuro.",
        icon: CheckCircleIcon,
      },
      {
        title: "2. Registra il debito",
        description:
          "Inserisci importo, scadenza e controparte: il contratto cifra in maniera sicura e memorizza i dati on-chain.",
        icon: LockClosedIcon,
      },
      {
        title: "3. Ripaga confidenzialmente con Zama",
        description:
          "Invia rimborsi confidenziali grazie a Zama: solo le parti coinvolte possono decifrare il saldo residuo.",
        icon: RocketLaunchIcon,
      },
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-500 via-sky-600 to-sky-700">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 pb-20 pt-16">
        <div className="grid gap-12 lg:grid-cols-[2fr,1fr] lg:items-center">
          <div className="space-y-6 text-left">
            <span className="inline-flex items-center rounded-full bg-sky-100/20 px-4 py-1 text-sm font-semibold text-sky-50">
              Loan Management 3.0
            </span>
            <h1 className="text-4xl font-bold leading-tight text-white md:text-5xl">
              Gestisci prestiti e debiti con privacy garantita da FHE
            </h1>
            <p className="text-lg text-sky-100/80">
              DebtRegistry combina smart contract Ethereum e crittografia Fully Homomorphic per tenere traccia dei debiti,
              creare rimborsi protetti e verificare i saldi senza esporre le informazioni sensibili.
              Con NexusChat puoi coordinarti con le controparti in modo sicuro e immediato.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/debtregistry"
                className="rounded-md bg-sky-200 px-6 py-3 text-base font-semibold text-sky-900 shadow-lg transition hover:scale-105 hover:bg-sky-300"
              >
                Apri il Debt Registry
              </Link>
            </div>
          </div>
        </div>

        <section className="grid gap-6 rounded-3xl border border-sky-200 bg-sky-50/80 p-10 shadow-xl lg:grid-cols-3">
          {steps.map(step => (
            <article key={step.title} className="flex flex-col gap-4 rounded-2xl border border-sky-200 bg-sky-100/70 p-6">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-sky-200/80 text-sky-700">
                <step.icon className="h-6 w-6" />
              </span>
              <h3 className="text-xl font-semibold text-sky-900">{step.title}</h3>
              <p className="text-sm text-sky-600">{step.description}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-3xl border border-sky-200 bg-sky-50/90 p-8 shadow-lg backdrop-blur-sm">
            <h3 className="text-2xl font-semibold text-sky-900">Cosa puoi fare</h3>
            <ul className="mt-4 space-y-3 text-base text-sky-600">
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
          <div className="rounded-3xl border border-sky-200 bg-sky-50/90 p-8 shadow-lg backdrop-blur-sm">
            <h3 className="text-2xl font-semibold text-sky-900">Perché Civic + Zama</h3>
            <p className="mt-4 text-base text-sky-600">
              Civic autentica l&apos;identità dell&apos;utente e garantisce sessioni affidabili. La componente Fully Homomorphic Encryption di Zama
              delinea un flusso in cui il contratto smart elabora importi cifrati, impedendo a terzi di leggere i dati sensibili.
            </p>
            <p className="mt-4 text-sm text-sky-500">
              Una volta dentro il Debt Registry i tuoi dati saranno al sicuro, crittografati e accessibili solo a te e alle controparti autorizzate.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-sky-300/60 bg-gradient-to-r from-sky-500 via-sky-600 to-sky-700 p-10 shadow-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-white">Pronto a iniziare?</h3>
              <p className="mt-2 text-base text-sky-100/80">
                Accedi, collega il wallet Civic e visita il Debt Registry per registrare il primo debito cifrato.
              </p>
            </div>
            <Link
              href="/debtregistry"
              className="rounded-md bg-white px-6 py-3 text-base font-semibold text-sky-700 shadow-lg transition hover:scale-105 hover:bg-sky-100"
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
