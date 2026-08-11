// Personal email domain detection — prevents deriving organisation website from
// webmail addresses like gmail.com, yahoo.*, etc.
// Ported from V2 _shared/email-domain-blocklist.ts. Pure function, no deps.

const EXACT = new Set<string>([
  // Global webmail
  "gmail.com", "googlemail.com",
  "hotmail.com", "outlook.com", "live.com", "msn.com", "passport.com",
  "icloud.com", "me.com", "mac.com",
  "aol.com", "aim.com",
  "protonmail.com", "proton.me", "pm.me",
  "zoho.com", "fastmail.com", "tutanota.com", "tutanota.de",
  "mail.com", "inbox.com",
  // Russia / Ukraine
  "mail.ru", "inbox.ru", "list.ru", "bk.ru", "rambler.ru",
  "ukr.net", "i.ua", "meta.ua",
  // China / Asia
  "qq.com", "foxmail.com",
  "163.com", "126.com", "139.com",
  "sina.com", "sina.cn", "sohu.com",
  "yeah.net", "aliyun.com",
  "naver.com", "daum.net", "hanmail.net", "kakao.com", "nate.com",
  "rediffmail.com", "rediff.com",
  // Europe ISPs
  "web.de", "gmx.de", "gmx.com", "gmx.net", "gmx.at", "gmx.ch",
  "t-online.de", "arcor.de", "freenet.de", "1und1.de",
  "free.fr", "orange.fr", "wanadoo.fr", "laposte.net", "sfr.fr", "neuf.fr",
  "libero.it", "virgilio.it", "tiscali.it", "alice.it", "tin.it",
  "btinternet.com", "sky.com", "talktalk.net", "virginmedia.com", "ntlworld.com",
  "mail.bg", "abv.bg",
  "seznam.cz", "centrum.cz",
  "wp.pl", "o2.pl", "onet.pl", "interia.pl", "gazeta.pl",
  // Latin America
  "uol.com.br", "bol.com.br", "terra.com.br", "ig.com.br",
  // ISPs
  "shaw.ca", "rogers.com", "bell.net", "sympatico.ca",
  "optusnet.com.au", "bigpond.com", "bigpond.net.au", "iinet.net.au", "tpg.com.au", "internode.on.net",
]);

const SUFFIXES = [
  "yahoo.com", "yahoo.co.uk", "yahoo.co.in", "yahoo.co.jp", "yahoo.com.au",
  "yahoo.com.br", "yahoo.com.mx", "yahoo.fr", "yahoo.de", "yahoo.es",
  "yahoo.it", "yahoo.com.ar", "yahoo.com.sg", "yahoo.com.ph", "yahoo.com.hk",
  "ymail.com", "rocketmail.com",
  "yandex.com", "yandex.ru", "yandex.ua", "yandex.kz", "yandex.by",
];

export function isPersonalEmailDomain(domain: string | null | undefined): boolean {
  if (!domain) return true;
  const d = domain.toLowerCase().trim().replace(/^@/, "");
  if (!d) return true;
  if (EXACT.has(d)) return true;
  for (const s of SUFFIXES) if (d === s || d.endsWith("." + s)) return true;
  return false;
}

export function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const m = email.trim().toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})$/i);
  return m ? m[1] : null;
}

// ponytail: self-check
if (import.meta.url.endsWith("/email-blocklist.ts") && process.argv[1]?.endsWith("email-blocklist.ts")) {
  const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error(`FAIL: ${msg}`); };
  assert(isPersonalEmailDomain("gmail.com") === true, "gmail blocked");
  assert(isPersonalEmailDomain("yahoo.co.uk") === true, "yahoo.co.uk blocked");
  assert(isPersonalEmailDomain("acme.com.au") === false, "org domain allowed");
  assert(emailDomain("info@acme.com.au") === "acme.com.au", "domain extraction");
  assert(emailDomain(null) === null, "null email");
  console.log("email-blocklist: all checks passed");
}
