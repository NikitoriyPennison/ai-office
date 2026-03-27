"use client";

import { useState, useEffect } from "react";

interface Branding {
  title: string;
  author: string;
  website: string;
  telegram: string;
  youtube: string;
  support: string;
}

const defaults: Branding = {
  title: "AI Office",
  author: "",
  website: "",
  telegram: "",
  youtube: "",
  support: "",
};

let cached: Branding | null = null;

export function useBranding(): Branding {
  const [branding, setBranding] = useState<Branding>(cached || defaults);

  useEffect(() => {
    if (cached) return;
    fetch("/api/branding")
      .then((r) => r.json())
      .then((data) => {
        cached = data;
        setBranding(data);
      })
      .catch((err) => console.error(err));
  }, []);

  return branding;
}
