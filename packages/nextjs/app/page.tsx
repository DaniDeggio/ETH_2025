"use client";

import Link from "next/link";
import type { NextPage } from "next";
import { useMemo } from "react";
import { CheckCircleIcon, LockClosedIcon, RocketLaunchIcon } from "@heroicons/react/24/outline";
import { useLanguage } from "../components/LanguageProvider";


const Home: NextPage = () => {

  const { t } = useLanguage();

  const steps = useMemo(
    () => [
      {
        title: t("home.steps.1.title"),
        description: t("home.steps.1.description"),
        icon: CheckCircleIcon,
      },
      {
        title: t("home.steps.2.title"),
        description: t("home.steps.2.description"),
        icon: LockClosedIcon,
      },
      {
        title: t("home.steps.3.title"),
        description: t("home.steps.3.description"),
        icon: RocketLaunchIcon,
      },
    ],
    [t],
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-500 via-sky-600 to-sky-700">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 pb-20 pt-16">
        <div className="grid gap-12 lg:grid-cols-[2fr,1fr] lg:items-center">
          <div className="space-y-6 text-left">
            <span className="inline-flex items-center rounded-full bg-sky-100/20 px-4 py-1 text-sm font-semibold text-sky-50">
              {t("home.badge")}
            </span>
            <h1 className="text-4xl font-bold leading-tight text-white md:text-5xl">
              {t("home.title")}
            </h1>
            <p className="text-lg text-sky-100/80">
              {t("home.description")}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/debtregistry"
                className="rounded-md bg-sky-200 px-6 py-3 text-base font-semibold text-sky-900 shadow-lg transition hover:scale-105 hover:bg-sky-300"
              >
                {t("home.openDebtRegistry")}
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
            <h3 className="text-2xl font-semibold text-sky-900">{t("home.whatYouCanDo.title")}</h3>
            <ul className="mt-4 space-y-3 text-base text-sky-600">
              <li>
                {t("home.whatYouCanDo.1")}
              </li>
              <li>
                {t("home.whatYouCanDo.2")}
              </li>
              <li>
                {t("home.whatYouCanDo.3")}
              </li>
            </ul>
          </div>
          <div className="rounded-3xl border border-sky-200 bg-sky-50/90 p-8 shadow-lg backdrop-blur-sm">
            <h3 className="text-2xl font-semibold text-sky-900">{t("home.whyCivicZama.title")}</h3>
            <p className="mt-4 text-base text-sky-600">
              {t("home.whyCivicZama.description")}
            </p>
            <p className="mt-4 text-sm text-sky-500">
              {t("home.whyCivicZama.note")}
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-sky-300/60 bg-gradient-to-r from-sky-500 via-sky-600 to-sky-700 p-10 shadow-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-white">{t("home.ready.title")}</h3>
              <p className="mt-2 text-base text-sky-100/80">
                {t("home.ready.description")}
              </p>
            </div>
            <Link
              href="/debtregistry"
              className="rounded-md bg-white px-6 py-3 text-base font-semibold text-sky-700 shadow-lg transition hover:scale-105 hover:bg-sky-100"
            >
              {t("home.ready.cta")}
            </Link>
          </div>
        </section>
      </section>
    </div>
  );
};

export default Home;
