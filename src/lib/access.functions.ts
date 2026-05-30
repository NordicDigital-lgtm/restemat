import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequestHost, setCookie } from "@tanstack/react-start/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const COOKIE_NAME = "restemat_pro";
const COOKIE_MAX_AGE = 34_560_000; // ~13 months

type Payload = { subId: string; periodEnd: number };

function b64urlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(normalized, "base64").toString("utf8");
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("hex");
}

function buildCookieValue(payload: Payload, secret: string): string {
  const encoded = b64urlEncode(JSON.stringify(payload));
  const sig = sign(encoded, secret);
  return `${encoded}.${sig}`;
}

function verifyCookieValue(value: string, secret: string): Payload | null {
  const lastDot = value.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === value.length - 1) return null;
  const encoded = value.slice(0, lastDot);
  const sigHex = value.slice(lastDot + 1);
  const expectedHex = sign(encoded, secret);
  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(sigHex, "hex");
    b = Buffer.from(expectedHex, "hex");
  } catch {
    return null;
  }
  if (a.length !== b.length || a.length === 0) return null;
  if (!timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(encoded)) as Payload;
    if (typeof parsed?.subId !== "string" || typeof parsed?.periodEnd !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function cookieDomainForHost(host: string | undefined): string | undefined {
  if (!host) return undefined;
  const hostname = host.split(":")[0].toLowerCase();
  // Share the cookie across restemat.com and any subdomain (e.g. www., restemat.restemat.com)
  if (hostname === "restemat.com" || hostname.endsWith(".restemat.com")) {
    return ".restemat.com";
  }
  return undefined;
}

function issueCookie(payload: Payload, secret: string) {
  const value = buildCookieValue(payload, secret);
  let host: string | undefined;
  try {
    host = getRequestHost();
  } catch {
    host = undefined;
  }
  const domain = cookieDomainForHost(host);
  console.log(`[access] issuing cookie host=${host ?? "<unknown>"} domain=${domain ?? "<host-only>"}`);
  setCookie(COOKIE_NAME, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    ...(domain ? { domain } : {}),
  });
}

type StripeSubscription = {
  id: string;
  status: string;
  current_period_end?: number;
  items?: {
    data?: Array<{ current_period_end?: number }>;
  };
};

type StripeCheckoutSession = {
  id: string;
  subscription: StripeSubscription | string | null;
};

async function stripeGet<T>(path: string): Promise<T | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("[access] STRIPE_SECRET_KEY missing");
    return null;
  }
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  console.log(`[access] Stripe GET ${path} -> ${res.status}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable>");
    console.error(`[access] Stripe error body: ${body}`);
    return null;
  }
  return (await res.json()) as T;
}

function isActiveStatus(status: string | undefined): boolean {
  return status === "active" || status === "trialing";
}

function readPeriodEnd(sub: StripeSubscription): number | null {
  if (typeof sub.current_period_end === "number") return sub.current_period_end;
  const fromItems = sub.items?.data?.[0]?.current_period_end;
  if (typeof fromItems === "number") return fromItems;
  return null;
}

export const activateProAccess = createServerFn({ method: "POST" })
  .inputValidator(z.object({ sessionId: z.string().min(1).max(255) }))
  .handler(async ({ data }) => {
    console.log(`[access] activateProAccess sessionId=${data.sessionId}`);
    const secret = process.env.COOKIE_SIGNING_SECRET;
    if (!secret) {
      console.error("[access] COOKIE_SIGNING_SECRET missing");
      return { ok: false as const };
    }

    const session = await stripeGet<StripeCheckoutSession>(
      `checkout/sessions/${encodeURIComponent(data.sessionId)}?expand[]=subscription`,
    );
    if (!session) return { ok: false as const };

    const sub = session.subscription;
    if (!sub || typeof sub === "string") {
      console.error("[access] Session has no expanded subscription");
      return { ok: false as const };
    }
    if (!isActiveStatus(sub.status)) {
      console.error(`[access] Subscription status not active: ${sub.status}`);
      return { ok: false as const };
    }

    const periodEnd = readPeriodEnd(sub);
    if (periodEnd === null) {
      console.error("[access] Could not determine current_period_end");
      return { ok: false as const };
    }

    issueCookie({ subId: sub.id, periodEnd }, secret);
    return { ok: true as const };
  });

export const getAccessStatus = createServerFn({ method: "GET" }).handler(async () => {
  const secret = process.env.COOKIE_SIGNING_SECRET;
  if (!secret) return { isPro: false as const };

  const raw = getCookie(COOKIE_NAME);
  if (!raw) return { isPro: false as const };

  const payload = verifyCookieValue(raw, secret);
  if (!payload) return { isPro: false as const };

  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec < payload.periodEnd) {
    return { isPro: true as const };
  }

  const sub = await stripeGet<StripeSubscription>(
    `subscriptions/${encodeURIComponent(payload.subId)}`,
  );
  if (!sub || !isActiveStatus(sub.status)) {
    return { isPro: false as const };
  }
  const periodEnd = readPeriodEnd(sub);
  if (periodEnd === null) {
    return { isPro: false as const };
  }
  issueCookie({ subId: sub.id, periodEnd }, secret);
  return { isPro: true as const };
});
