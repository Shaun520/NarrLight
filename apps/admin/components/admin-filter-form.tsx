"use client";

import type { FormEvent, MouseEvent, ReactNode } from "react";
import { useState } from "react";

export function AdminFilterForm({
  action,
  children,
}: {
  action: string;
  children: ReactNode;
}) {
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    const formData = new FormData(form);
    const params = new URLSearchParams();

    for (const [key, rawValue] of formData.entries()) {
      const value = String(rawValue).trim();
      if (!value || value === "all") continue;
      params.set(key, value);
    }

    const query = params.toString();
    await refreshList(form, query ? `${action}?${query}` : action);
  }

  async function handleClick(event: MouseEvent<HTMLFormElement>) {
    const target = event.target instanceof Element ? event.target.closest("a") : null;
    if (!(target instanceof HTMLAnchorElement)) return;

    const targetUrl = new URL(target.href);
    if (targetUrl.pathname !== action || targetUrl.search) return;

    event.preventDefault();
    event.currentTarget.reset();
    await refreshList(event.currentTarget, action);
  }

  return (
    <form aria-busy={pending} className="toolbar" onClick={handleClick} onSubmit={handleSubmit}>
      {children}
    </form>
  );

  async function refreshList(form: HTMLFormElement, url: string) {
    setPending(true);

    try {
      const response = await fetch(url, {
        headers: {
          "x-admin-fragment-request": "1",
        },
      });
      const html = await response.text();
      const nextDocument = new DOMParser().parseFromString(html, "text/html");
      const currentCard = form.closest<HTMLElement>(".admin-card");
      const nextCard = nextDocument.querySelector<HTMLElement>(".admin-card");

      if (!currentCard || !nextCard) {
        window.location.href = url;
        return;
      }

      replaceFragment(currentCard, nextCard, ".admin-inline-alert");
      replaceFragment(currentCard, nextCard, ".table-wrap");
      replaceFragment(currentCard, nextCard, ".pagination");
    } finally {
      setPending(false);
    }
  }
}

function replaceFragment(currentRoot: HTMLElement, nextRoot: HTMLElement, selector: string) {
  const current = currentRoot.querySelector<HTMLElement>(selector);
  const next = nextRoot.querySelector<HTMLElement>(selector);

  if (current && next) {
    current.replaceWith(next);
    return;
  }

  if (!current && next) {
    currentRoot.querySelector(".toolbar")?.insertAdjacentElement("afterend", next);
  }

  if (current && !next) {
    current.remove();
  }
}
